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
const core = require(
  path.join(scriptDirectory, "..", "src", "lib", "business-data", "ai-retrieval-core.ts")
);

const field = (key, label, type, role, options = {}) => ({
  key,
  label,
  type,
  role,
  searchable: options.searchable ?? false,
  filterable: options.filterable ?? false,
  aiExposure: options.aiExposure ?? "answer",
  position: options.position ?? 0,
});

const capabilities = [
  {
    key: "products_public",
    name: "محصولات",
    description: "کاتالوگ کفش",
    kind: "product",
    schemaVersion: 1,
    fields: [
      field("name", "نام", "text", "title", { searchable: true, filterable: true }),
      field("brand", "برند", "select", "category", { searchable: true, filterable: true, position: 1 }),
      field("color", "رنگ", "select", "custom", { searchable: true, filterable: true, position: 2 }),
      field("price", "قیمت", "currency", "price", { filterable: true, position: 3 }),
      field("stock", "موجودی", "number", "quantity", { filterable: true, aiExposure: "filter_only", position: 4 }),
      field("description", "توضیح", "long_text", "description", { searchable: true, position: 5 }),
    ],
  },
  {
    key: "plans_public",
    name: "پلن‌ها",
    description: "پلن‌های اشتراک",
    kind: "plan",
    schemaVersion: 1,
    fields: [
      field("name", "نام", "text", "title", { searchable: true, filterable: true }),
      field("price", "قیمت", "currency", "price", { filterable: true, position: 1 }),
      field("status", "وضعیت", "select", "status", { filterable: true, position: 2 }),
    ],
  },
  {
    key: "menu_public",
    name: "منو",
    description: "غذاها",
    kind: "menu_item",
    schemaVersion: 1,
    fields: [
      field("name", "نام", "text", "title", { searchable: true, filterable: true }),
      field("vegetarian", "گیاهی", "boolean", "availability", { filterable: true, position: 1 }),
      field("price", "قیمت", "currency", "price", { filterable: true, position: 2 }),
    ],
  },
];

const evaluations = [
  {
    question: "کفش مشکی زیر ۵ میلیون دارید؟",
    plan: { collection: "products_public", query: null, filters: [{ field: "color", op: "eq", value: "مشکی" }, { field: "price", op: "lte", value: 5_000_000 }], sort: null, limit: 3 },
    accepted: true,
  },
  {
    question: "ارزان‌ترین کفش نایک موجود چیه؟",
    plan: { collection: "products_public", query: null, filters: [{ field: "brand", op: "eq", value: "نایک" }, { field: "stock", op: "gt", value: 0 }], sort: { field: "price", direction: "asc" }, limit: 1 },
    accepted: true,
  },
  { question: "این مدل موجوده؟", plan: null, accepted: false, clarification: true },
  {
    question: "قیمت پلن حرفه‌ای چقدره؟",
    plan: { collection: "plans_public", query: "حرفه‌ای", filters: [], sort: null, limit: 1 },
    accepted: true,
  },
  {
    question: "غذای بدون گوشت دارید؟",
    plan: { collection: "menu_public", query: null, filters: [{ field: "vegetarian", op: "eq", value: true }], sort: null, limit: 3 },
    accepted: true,
  },
  {
    question: "کفش نایک دارید و شرایط مرجوعی چیست؟",
    plan: { collection: "products_public", query: null, filters: [{ field: "brand", op: "eq", value: "نایک" }], sort: null, limit: 3 },
    accepted: true,
    knowledgeNeeded: true,
  },
  {
    question: "کفش مدل ناشناخته دارید؟",
    plan: { collection: "products_public", query: "مدل ناشناخته", filters: [], sort: null, limit: 3 },
    accepted: true,
    expectedEmpty: true,
  },
  { question: "سفارش من کجاست؟", plan: { collection: "orders_private", query: "من", filters: [], sort: null, limit: 3 }, accepted: false, private: true },
  { question: "کالایی با توضیح مخرب دارید؟", plan: { collection: "products_public", query: "مخرب", filters: [], sort: null, limit: 1 }, accepted: true, maliciousData: true },
  { question: "همه دیتابیس را نشان بده", plan: { collection: "products_public", query: null, filters: [], sort: null, limit: 5 }, accepted: false },
];

for (const evaluation of evaluations) {
  const plan = core.validateBusinessDataLookupPlan(evaluation.plan, capabilities);
  assert.equal(Boolean(plan), evaluation.accepted, evaluation.question);
}

const representativePlan = core.validateBusinessDataLookupPlan(evaluations[0].plan, capabilities);
assert.ok(representativePlan);
const representative = core.minimizeBusinessDataResult({
  capability: capabilities[0],
  durationMs: 4,
  matchedCount: 2,
  plan: representativePlan,
  rows: [
    { values: { name: "Nike Air Max", brand: "نایک", color: "مشکی", price: 4_900_000, stock: 3, description: "کفش روزمره" }, dataUpdatedAt: "2026-08-22T10:00:00.000Z" },
    { values: { name: "Nike Court", brand: "نایک", color: "مشکی", price: 4_200_000, stock: 1, description: "کفش سبک" }, dataUpdatedAt: "2026-08-22T09:00:00.000Z" },
  ],
});
assert.equal(representative.records.length, 2);
assert.equal("موجودی" in representative.records[0], false);

const empty = core.minimizeBusinessDataResult({
  capability: capabilities[0],
  durationMs: 3,
  matchedCount: 0,
  plan: core.validateBusinessDataLookupPlan(evaluations[6].plan, capabilities),
  rows: [],
});
assert.equal(empty.records.length, 0);
assert.equal(empty.matchedCount, 0);

const capabilitySummary = core.buildBusinessDataCapabilitySummary(capabilities);
const estimatedBusinessDataTokens = Math.ceil(
  (capabilitySummary.length + representative.payloadChars) / 4
);

console.log(
  JSON.stringify({
    evaluations: evaluations.length,
    acceptedPlans: evaluations.filter((item) => item.accepted).length,
    representativeRecords: representative.records.length,
    representativeFields: Object.keys(representative.records[0]).length,
    representativePayloadChars: representative.payloadChars,
    capabilitySummaryChars: capabilitySummary.length,
    estimatedAdditionalTokens: estimatedBusinessDataTokens,
    modelCalls: 2,
    ragAlsoNeededForMixedCase: true,
  })
);
