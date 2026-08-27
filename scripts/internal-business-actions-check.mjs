import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(directory, "..");
const read = (...segments) => fs.readFileSync(path.join(root, ...segments), "utf8");

const sql = read("supabase", "ai-actions.sql");
const businessDataSql = read("supabase", "business-data.sql");
const business = read("src", "lib", "ai", "actions", "business.ts");
const configuration = read(
  "src",
  "lib",
  "ai",
  "actions",
  "business-config.ts"
);
const route = read("src", "app", "api", "ai", "actions", "route.ts");
const panel = read(
  "src",
  "components",
  "dashboard",
  "action-settings-panel.tsx"
);

const extractFunction = (name, nextName) => {
  const start = sql.indexOf(`create or replace function public.${name}`);
  const end = nextName
    ? sql.indexOf(`create or replace function public.${nextName}`, start + 1)
    : sql.length;
  assert.ok(start >= 0, `${name} RPC exists`);
  assert.ok(end > start, `${name} RPC has a complete body`);
  return sql.slice(start, end);
};

const availabilityRpc = extractFunction(
  "business_data_check_availability_action",
  "business_data_create_reservation_action"
);
const reservationRpc = extractFunction(
  "business_data_create_reservation_action",
  "business_data_create_order_action"
);
const orderRpc = extractFunction(
  "business_data_create_order_action",
  "business_data_cancel_action"
);
const cancellationRpc = extractFunction("business_data_cancel_action");

for (const rpc of [availabilityRpc, reservationRpc, orderRpc, cancellationRpc]) {
  assert.match(rpc, /security definer/);
  assert.match(rpc, /set search_path = ''/);
  assert.match(rpc, /setting\.user_id = p_user_id/);
  assert.match(rpc, /collection\.user_id = setting\.user_id|orders\.user_id = setting\.user_id/);
  assert.match(rpc, /from public, anon, authenticated/);
  assert.match(rpc, /to service_role/);
}

assert.match(configuration, /"internal_business_data"/);
assert.match(configuration, /"external_supabase"/);
assert.match(configuration, /sourceId:\s*usesExternalSource \? source!\.id : null/);
assert.match(configuration, /destination === "internal_business_data"/);
assert.match(configuration, /primary\.fields\.some/);
assert.match(configuration, /hasMappingConflict/);
assert.match(configuration, /serverGenerated/);
assert.match(configuration, /isInternalGeneratedCollectionField/);
assert.match(configuration, /mapsGeneratedFieldToBusinessConcept/);
assert.match(configuration, /canMapGeneratedOrderField/);
assert.doesNotMatch(orderRpc, /source_type\s*=\s*'(?:manual|csv|excel)'/);
assert.doesNotMatch(reservationRpc, /source_type\s*=\s*'(?:manual|csv|excel)'/);

assert.match(orderRpc, /execution\.action_key = 'create_order'/);
assert.match(orderRpc, /execution\.status = 'executing'/);
assert.match(orderRpc, /for update/);
assert.match(orderRpc, /record\.id = p_product_record_id/);
assert.match(orderRpc, /current_price is distinct from p_expected_unit_price/);
assert.match(orderRpc, /'status', 'price_changed'/);
assert.match(orderRpc, /current_stock < p_quantity/);
assert.match(orderRpc, /current_stock - p_quantity/);
assert.match(orderRpc, /insert into public\.business_data_records/);
assert.match(orderRpc, /semantic_role = 'title'/);
assert.match(orderRpc, /semantic_role = 'reference'/);
assert.doesNotMatch(orderRpc, /'execution_id'/);
assert.match(orderRpc, /record\.external_id = order_reference/);
assert.match(businessDataSql, /business_data_records_external_id_unique/);
assert.match(orderRpc, /jsonb_typeof\([\s\S]*stockTrackingEnabled/);
assert.match(orderRpc, /'status', 'created'/);
assert.ok(
  orderRpc.indexOf("for update") < orderRpc.indexOf("current_stock - p_quantity"),
  "The product row is locked before stock changes"
);
assert.ok(
  orderRpc.indexOf("current_stock - p_quantity") <
    orderRpc.indexOf("insert into public.business_data_records"),
  "Stock decrement and order insert share the same RPC transaction"
);

assert.match(reservationRpc, /execution\.action_key = 'create_reservation'/);
assert.match(reservationRpc, /record\.external_id = reservation_reference/);
assert.match(reservationRpc, /for update/);
assert.match(reservationRpc, /remaining_capacity < p_party_size/);
assert.match(reservationRpc, /remaining_capacity - p_party_size/);
assert.match(reservationRpc, /availability_match_count <> 1/);
assert.match(reservationRpc, /insert into public\.business_data_records/);
assert.match(reservationRpc, /date_key = time_key/);
assert.match(reservationRpc, /semantic_role = 'title'/);

assert.match(availabilityRpc, /business_data_records/);
assert.match(availabilityRpc, /matched_count <> 1/);
assert.match(availabilityRpc, /remaining_capacity >= p_party_size/);

assert.match(cancellationRpc, /p_action_key not in \('cancel_order', 'cancel_reservation'\)/);
assert.match(cancellationRpc, /business_data_verified_customer_sessions/);
assert.match(cancellationRpc, /session\.record_id = p_record_id/);
assert.match(cancellationRpc, /session\.customer_identity_hash = p_customer_identity_hash/);
assert.match(cancellationRpc, /session\.expires_at > now\(\)/);
assert.match(cancellationRpc, /set values = jsonb_set/);
assert.doesNotMatch(cancellationRpc, /delete from public\.business_data_records/);

assert.match(business, /business_data_create_order_action/);
assert.match(business, /business_data_create_reservation_action/);
assert.match(business, /business_data_check_availability_action/);
assert.match(business, /business_data_cancel_action/);
assert.match(business, /insertSupabaseActionRow/);
assert.match(business, /updateSupabaseActionRow/);
assert.match(business, /readSupabaseActionRows/);
assert.match(business, /new ActionPublicError\(/);
assert.match(business, /قیمت محصول تغییر کرده/);

assert.match(route, /destination: parsedConfiguration\.destination/);
assert.match(route, /stockTrackingEnabled/);
assert.match(route, /buildBusinessActionPrerequisite/);
assert.match(panel, /داده‌های پشتیبان/);
assert.match(panel, /کنترل و کاهش موجودی/);
assert.match(configuration, /ایجاد مجموعه محصولات/);
assert.match(configuration, /ایجاد مجموعه سفارش‌ها/);
assert.match(configuration, /ایجاد مجموعه رزروها/);
assert.match(configuration, /تنظیم تأیید هویت/);
assert.match(panel, /اتصال منبع خارجی/);
assert.match(panel, /suggestedMappings/);
assert.match(panel, /concept\.side === "primary"/);
assert.match(panel, /mappingSignals/);
assert.match(panel, /hasValidMapping/);
assert.match(panel, /فیلد انتخاب‌شده برای/);
assert.doesNotMatch(panel, /مجموعه فعال و متصل به Supabase با ساختار مناسب پیدا نشد/);

console.log(
  "Validated internal order, stock, reservation, availability, cancellation, idempotency, tenant isolation, service-only RPC grants, external connector preservation, and Action prerequisite UX."
);
