import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const businessDataDirectory = path.join(
  scriptDirectory,
  "..",
  "src",
  "lib",
  "business-data"
);
const validation = require(path.join(businessDataDirectory, "validation.ts"));
const templates = require(path.join(businessDataDirectory, "templates.ts"));
const serverSource = fs.readFileSync(
  path.join(businessDataDirectory, "server.ts"),
  "utf8"
);
const sqlSource = fs.readFileSync(
  path.join(scriptDirectory, "..", "supabase", "business-data.sql"),
  "utf8"
);

assert.equal(templates.BUSINESS_DATA_TEMPLATES.length, 22);
for (const template of templates.BUSINESS_DATA_TEMPLATES) {
  const result = validation.validateCollectionDefinition({
    name: template.label,
    description: template.description,
    kind: template.kind,
    accessScope: template.accessScope,
    status: "active",
    aiEnabled: template.aiEnabled,
    fields: template.fields,
  });
  assert.equal(result.ok, true, `Template ${template.id} must validate`);
  if (template.accessScope !== "public_catalog") {
    assert.equal(template.aiEnabled, false, `Private template ${template.id} must default AI off`);
  }
}

const products = templates.getBusinessDataTemplate("products");
assert.ok(products);

const privateAi = validation.validateCollectionDefinition({
  name: "سفارش‌ها",
  description: "",
  kind: "order",
  accessScope: "verified_customer",
  status: "active",
  aiEnabled: true,
  fields: templates.getBusinessDataTemplate("orders").fields,
});
assert.equal(privateAi.ok, false, "Private collections must reject AI enablement");

const validRecord = validation.validateRecordValues(
  {
    name: "کالای نمونه",
    sku: "SKU-1",
    price: 120000,
    available: true,
    description: "توضیح کوتاه",
    url: "https://example.com/product",
  },
  products.fields
);
assert.equal(validRecord.ok, true);

const missingTitle = validation.validateRecordValues(
  { price: 10, available: true },
  products.fields
);
assert.equal(missingTitle.ok, false, "Required title must be enforced");

const unknownField = validation.validateRecordValues(
  { name: "نمونه", secret: "must not pass" },
  products.fields
);
assert.equal(unknownField.ok, false, "Unknown fields must be rejected");

const unsafeUrl = validation.validateRecordValues(
  { name: "نمونه", url: "https://user:pass@example.com/private" },
  products.fields
);
assert.equal(unsafeUrl.ok, false, "Credential-bearing URLs must be rejected");

const answerValues = validation.selectAiAnswerValues(
  {
    reference: "ORDER-1",
    summary: "سفارش نمونه",
    status: "جدید",
    total: 250000,
    customer_identifier: "customer-private",
    internal_notes: "internal-private",
  },
  templates.getBusinessDataTemplate("orders").fields
);
assert.equal("customer_identifier" in answerValues, false);
assert.equal("internal_notes" in answerValues, false);
assert.equal("reference" in answerValues, false, "Filter-only values must not enter answers");
assert.equal(answerValues.summary, "سفارش نمونه");

assert.match(serverSource, /supabase\.auth\.getUser\(\)/);
assert.match(serverSource, /return \{ admin: createAdminClient\(\), user \}/);
assert.ok(
  (serverSource.match(/\.eq\("user_id", context\.user\.id\)/g) ?? []).length >=
    15,
  "Business Data queries must retain explicit owner predicates"
);
assert.doesNotMatch(
  serverSource,
  /(?:body|input)\.user_id/,
  "Client-provided user IDs must never establish ownership"
);
assert.match(serverSource, /\.rpc\(\s*"business_data_create_manual_collection"/);
assert.match(serverSource, /\.rpc\("business_data_move_field"/);
assert.match(
  sqlSource,
  /revoke execute on function public\.business_data_create_manual_collection\([\s\S]*?from public, anon, authenticated;/
);
assert.match(
  sqlSource,
  /grant execute on function public\.business_data_create_manual_collection\([\s\S]*?to service_role;/
);
assert.match(
  sqlSource,
  /revoke execute on function public\.business_data_move_field\([\s\S]*?from public, anon, authenticated;/
);
assert.match(
  sqlSource,
  /revoke all on table public\.business_data_records from anon, authenticated;/
);

const routeDirectory = path.join(
  scriptDirectory,
  "..",
  "src",
  "app",
  "api",
  "business-data",
  "collections"
);
const mutationRoutes = [
  "route.ts",
  path.join("[collectionId]", "route.ts"),
  path.join("[collectionId]", "fields", "route.ts"),
  path.join("[collectionId]", "fields", "[fieldId]", "route.ts"),
  path.join("[collectionId]", "records", "route.ts"),
  path.join("[collectionId]", "records", "[recordId]", "route.ts"),
];
for (const route of mutationRoutes) {
  const source = fs.readFileSync(path.join(routeDirectory, route), "utf8");
  assert.match(source, /getBusinessDataContext\(\)/, `${route} must authenticate`);
  assert.match(
    source,
    /hasValidBusinessDataOrigin\(request\)/,
    `${route} mutations must reject cross-origin requests`
  );
  assert.match(source, /businessDataErrorResponse\(error\)/, `${route} must use safe errors`);
}

console.log(
  `Validated ${templates.BUSINESS_DATA_TEMPLATES.length} templates, record boundaries, private access defaults, AI field redaction, and the authenticated mutation contract.`
);
