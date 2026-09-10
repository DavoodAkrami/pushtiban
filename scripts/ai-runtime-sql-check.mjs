import assert from "node:assert/strict";
import fs from "node:fs";
// Install the pinned test-only dependency outside the checkout. Production has no dependency on it.
const { PGlite } = await import(
  process.env.PGLITE_MODULE ??
    "/private/tmp/pushtiban-phase2-sql/node_modules/@electric-sql/pglite/dist/index.js"
);
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create table auth.users(id uuid primary key);
create table public.telegram_connections(id uuid primary key,user_id uuid);
create table public.instagram_connections(id uuid primary key,user_id uuid);
create table public.business_action_executions(id uuid primary key,user_id uuid,channel text,connection_id uuid,customer_identity_hash text,conversation_key_hash text,status text,action_key text,failure_code text,completed_at timestamptz);
grant all on all tables in schema public to service_role;
`);
const sql = fs.readFileSync(
  new URL("../supabase/ai-runtime.sql", import.meta.url),
  "utf8",
);
await db.exec(sql);
await db.exec(sql);
const owner = "11111111-1111-4111-8111-111111111111";
const conn = "22222222-2222-4222-8222-222222222222";
const execution = "33333333-3333-4333-8333-333333333333";
const hash = "a".repeat(64);
await db.query("insert into auth.users values ($1)", [owner]);
await db.query("insert into telegram_connections values ($1,$2)", [
  conn,
  owner,
]);
await db.exec("set role service_role");
const load = async () =>
  (
    await db.query("select ai_runtime_load($1,'telegram',$2,$3,$3) as value", [
      owner,
      conn,
      hash,
    ])
  ).rows[0].value;
let c = await load();
assert.equal(c.revision, 0);
assert.equal((await load()).id, c.id);
const draft = {
  id: execution,
  type: "create_order",
  phase: "confirmation_required",
  fields: { quantity: 1 },
  confirmation: { executionId: execution },
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};
const save = async (revision, value) =>
  (
    await db.query("select ai_runtime_save($1,$2,$3,$4,'ai_active') as value", [
      owner,
      c.id,
      revision,
      JSON.stringify(value),
    ])
  ).rows[0].value;
c = await save(0, draft);
await assert.rejects(save(0, draft), /revision conflict/);
await db.query(
  "insert into business_action_executions values($1,$2,'telegram',$3,$4,$4,'pending_confirmation','create_order',null,null)",
  [execution, owner, conn, hash],
);
c = await save(c.revision, {
  ...draft,
  fields: { quantity: 2 },
  confirmation: { executionId: null },
  phase: "collecting",
});
assert.equal(
  (await db.query("select status from business_action_executions")).rows[0]
    .status,
  "failed",
);
await db.query(
  "update business_action_executions set status='pending_confirmation'",
);
await assert.rejects(
  db.query("update business_action_executions set status='executing'"),
  /inactive task/,
);
c = await save(c.revision, draft);
await db.query("update business_action_executions set status='executing'");
await assert.rejects(
  save(c.revision, { ...draft, phase: "cancelled" }),
  /action executing/,
);
await db.query("update business_action_executions set status='succeeded'");
c = await save(c.revision, {
  ...draft,
  phase: "completed",
  fields: {},
  confirmation: { executionId: null },
});
await db.query(
  "update business_action_executions set status='pending_confirmation'",
);
await assert.rejects(
  db.query("update business_action_executions set status='executing'"),
  /inactive task/,
);
c = await save(c.revision, { ...draft, expiresAt: new Date(0).toISOString() });
await db.query(
  "update business_action_executions set status='pending_confirmation'",
);
await assert.rejects(
  db.query("update business_action_executions set status='executing'"),
  /inactive task/,
);
for (const role of ["anon", "authenticated"]) {
  await db.exec(`reset role; set role ${role}`);
  await assert.rejects(
    db.query("select * from ai_runtime_conversations"),
    /permission denied/,
  );
  await assert.rejects(load(), /permission denied/);
}
await db.exec("reset role");
assert.equal(
  (
    await db.query(
      "select relrowsecurity from pg_class where relname='ai_runtime_conversations'",
    )
  ).rows[0].relrowsecurity,
  true,
);
await db.close();
console.log(
  "SQL: migration applied twice; CAS, superseded confirmation, executing action, expiry, completion, RLS and client-role denial passed (local PostgreSQL/PGlite).",
);
