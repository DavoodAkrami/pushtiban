import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptDirectory, "..");

require.extensions[".ts"] = (module, filename) => {
  let source = fs.readFileSync(filename, "utf8");
  source = source.replace('import "server-only";', "");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const connectorPath = path.join(root, "src", "lib", "business-data", "supabase-connector.ts");
const syncPath = path.join(root, "src", "lib", "business-data", "supabase-sync.ts");
const sqlPath = path.join(root, "supabase", "business-data.sql");
const sourcePanelPath = path.join(root, "src", "components", "dashboard", "business-data", "source-panel.tsx");
const connectorFlowPath = path.join(root, "src", "components", "dashboard", "business-data", "supabase-connector-flow.tsx");

const connector = require(connectorPath);
const secretKey = `sb_secret_${"a".repeat(32)}`;

assert.equal(
  connector.parseSupabaseProjectUrl("https://sample-ref.supabase.co"),
  "https://sample-ref.supabase.co"
);
for (const unsafeUrl of [
  "http://sample-ref.supabase.co",
  "https://127.0.0.1",
  "https://sample-ref.supabase.co.evil.test",
  "https://user:pass@sample-ref.supabase.co",
  "https://sample-ref.supabase.co/rest/v1",
  "https://custom.example.com",
]) {
  assert.throws(() => connector.parseSupabaseProjectUrl(unsafeUrl));
}
assert.equal(connector.parseSupabaseApiKey(secretKey), secretKey);
assert.throws(() => connector.parseSupabaseApiKey("anon-public-key"));
const fakeAnonJwt = [
  Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url"),
  "signature",
].join(".");
assert.throws(() => connector.parseSupabaseApiKey(fakeAnonJwt));

const openApi = {
  paths: {
    "/products": { get: {} },
    "/orders": { get: {} },
    "/rpc/rebuild": { get: {} },
  },
  definitions: {
    products: {
      properties: {
        id: { type: "integer", format: "int8" },
        name: { type: "string" },
      },
    },
    orders: {
      properties: {
        id: { type: "string", format: "uuid" },
        execution_id: { type: "string", format: "uuid" },
        status: { type: "string" },
      },
    },
  },
};

const originalFetch = globalThis.fetch;
const requests = [];
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  requests.push({ url, init });
  if (url.endsWith("/rest/v1/")) {
    return new Response(JSON.stringify(openApi), {
      status: 200,
      headers: { "Content-Type": "application/openapi+json" },
    });
  }
  if (init.method === "HEAD") {
    return new Response(null, { status: 200, headers: { "Content-Range": "0-0/42" } });
  }
  if (url.includes("/rest/v1/products?")) {
    return new Response(JSON.stringify([{ id: 1, name: "Coffee" }]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (url.includes("/rest/v1/orders?") && init.method === "POST") {
    return new Response(
      JSON.stringify([
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          execution_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          status: "pending",
        },
      ]),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  }
  if (url.includes("/rest/v1/orders?") && init.method === "PATCH") {
    return new Response(
      JSON.stringify([
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          status: "cancelled",
        },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
  return new Response(null, { status: 404 });
};

try {
  const credentials = {
    projectUrl: "https://sample-ref.supabase.co",
    apiKey: secretKey,
  };
  const tables = await connector.discoverSupabaseTables(credentials);
  assert.deepEqual(tables.map((table) => table.name), ["products", "orders"]);
  assert.equal(tables[0].approximateRowCount, 42);
  assert.equal(tables[0].suggestedPurpose, "محصولات");
  assert.deepEqual(tables[0].columns, [
    { name: "id", type: "int8" },
    { name: "name", type: "string" },
  ]);
  const table = await connector.readSupabaseTable(credentials, "products");
  assert.deepEqual(table.rows, [{ id: 1, name: "Coffee" }]);
  assert.deepEqual(table.columns, ["id", "name"]);
  await assert.rejects(() => connector.readSupabaseTable(credentials, "private_table"));
  const actionRows = await connector.readSupabaseActionRows({
    credentials,
    tableName: "products",
    columns: ["id", "name"],
    filters: [{ column: "name", value: "Coffee" }],
    limit: 1,
  });
  assert.deepEqual(actionRows, [{ id: 1, name: "Coffee" }]);
  await assert.rejects(() =>
    connector.readSupabaseActionRows({
      credentials,
      tableName: "products",
      columns: ["password"],
      filters: [],
      limit: 1,
    })
  );
  const inserted = await connector.insertSupabaseActionRow({
    credentials,
    tableName: "orders",
    values: {
      execution_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      status: "pending",
    },
    returningColumns: ["id"],
  });
  assert.equal(inserted.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  const updated = await connector.updateSupabaseActionRow({
    credentials,
    tableName: "orders",
    match: { column: "id", value: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    values: { status: "cancelled" },
  });
  assert.equal(updated.status, "cancelled");
  assert.ok(requests.every((request) => request.init.headers.apikey === secretKey));
  assert.ok(
    requests.every((request) => !("Authorization" in request.init.headers)),
    "Modern secret keys must not be forwarded as legacy bearer JWTs"
  );
} finally {
  globalThis.fetch = originalFetch;
}

const connectorSource = fs.readFileSync(connectorPath, "utf8");
const syncSource = fs.readFileSync(syncPath, "utf8");
const sqlSource = fs.readFileSync(sqlPath, "utf8");
const sourcePanelSource = fs.readFileSync(sourcePanelPath, "utf8");
const connectorFlowSource = fs.readFileSync(connectorFlowPath, "utf8");

assert.match(connectorSource, /\^\[a-z0-9-\]\+\\\.supabase\\\.co\$/i);
assert.match(connectorSource, /REQUEST_TIMEOUT_MS/);
assert.match(connectorSource, /OPENAPI_MAX_BYTES/);
assert.doesNotMatch(connectorSource, /console\.(?:log|error|warn)/);
assert.match(syncSource, /encryptSecret\(JSON\.stringify\(\{ projectUrl, apiKey \}\)\)/);
assert.match(syncSource, /decryptSecret\(data\.secret_ciphertext\)/);
assert.ok(
  (syncSource.match(/\.eq\("user_id", context\.user\.id\)/g) ?? []).length >= 3 &&
    (syncSource.match(/\.eq\("user_id", userId\)/g) ?? []).length >= 1,
  "Every connector source and secret lookup must retain an owner predicate"
);
assert.match(syncSource, /error_summary: "همگام‌سازی Supabase کامل نشد\."/);
assert.doesNotMatch(syncSource, /console\.(?:log|error|warn)/);
assert.match(sqlSource, /p_source_type not in \('csv', 'excel', 'google_sheets', 'supabase'\)/);
assert.match(sourcePanelSource, /همگام‌سازی اکنون/);
assert.match(connectorFlowSource, /تست اتصال/);
assert.match(connectorFlowSource, /کلید فقط در سرور و به‌صورت رمزگذاری‌شده نگهداری می‌شود/);

for (const routeName of ["test", "connect", "sync"]) {
  const routeSource = fs.readFileSync(
    path.join(root, "src", "app", "api", "business-data", "supabase", routeName, "route.ts"),
    "utf8"
  );
  assert.match(routeSource, /getBusinessDataContext\(\)/, `${routeName} must authenticate`);
  assert.match(routeSource, /hasValidBusinessDataOrigin\(request\)/, `${routeName} must reject cross-origin mutations`);
  assert.match(routeSource, /businessDataErrorResponse\(error\)/, `${routeName} must sanitize unexpected failures`);
  assert.doesNotMatch(routeSource, /console\.(?:log|error|warn)/);
}

console.log("Supabase connector checks passed.");
