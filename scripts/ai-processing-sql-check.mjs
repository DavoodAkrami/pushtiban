import assert from "node:assert/strict";
import fs from "node:fs";
const { PGlite } = await import(
  process.env.PGLITE_MODULE ??
    "/private/tmp/pushtiban-phase2-sql/node_modules/@electric-sql/pglite/dist/index.js"
);
export const createProcessingDb = async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create table public.telegram_connections(id uuid primary key,user_id uuid);
 create table public.instagram_connections(id uuid primary key,user_id uuid);
 create table public.business_action_executions(id uuid primary key,user_id uuid,channel text,connection_id uuid,customer_identity_hash text,conversation_key_hash text,status text,action_key text,failure_code text,completed_at timestamptz,execution_started_at timestamptz,requires_confirmation boolean,confirmation_expires_at timestamptz);
 create table public.ai_business_limits(user_id uuid primary key,monthly_token_limit bigint,monthly_message_limit integer,ai_blocked boolean default false);
 create table public.ai_usage_log(id uuid primary key default gen_random_uuid(),user_id uuid,kind text,provider text,model text,prompt_tokens integer,completion_tokens integer,total_tokens integer,created_at timestamptz default now());
 create table public.ai_global_settings(id integer,ai_enabled boolean);
 create table public.ai_assistant_settings(user_id uuid,is_enabled boolean,telegram_enabled boolean,instagram_enabled boolean);
 grant usage on schema auth to service_role; grant select,update on auth.users to service_role;
 grant all on all tables in schema public to service_role;`);
  await db.exec(fs.readFileSync("supabase/ai-runtime.sql", "utf8"));
  const sql = fs.readFileSync("supabase/ai-processing.sql", "utf8");
  await db.exec(sql);
  await db.exec(sql);
  return db;
};
export const owner = "11111111-1111-4111-8111-111111111111";
export const conn = "22222222-2222-4222-8222-222222222222";
export const scope = {
  userId: owner,
  channel: "telegram",
  connectionId: conn,
  customerIdentityHash: "a".repeat(64),
  conversationKeyHash: "b".repeat(64),
};
export const seed = async (db) => {
  await db.query("insert into auth.users values($1)", [owner]);
  await db.query("insert into telegram_connections values($1,$2)", [
    conn,
    owner,
  ]);
  await db.query("insert into instagram_connections values($1,$2)", [
    conn,
    owner,
  ]);
  await db.query("insert into ai_business_limits values($1,1000000,20,false)", [
    owner,
  ]);
  await db.query(
    "insert into ai_assistant_settings values($1,true,true,true)",
    [owner],
  );
  await db.exec("insert into ai_global_settings values(1,true)");
};
export const rpc = async (db, name, args) => {
  const keys = Object.keys(args);
  const values = keys.map((k) =>
    typeof args[k] === "object" && args[k] !== null
      ? JSON.stringify(args[k])
      : args[k],
  );
  const result = await db.query(
    `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(",")}) as value`,
    values,
  );
  return result.rows[0]?.value;
};
if (process.argv[1]?.endsWith("ai-processing-sql-check.mjs")) {
  const db = await createProcessingDb();
  await seed(db);
  const receive = (id, order = Number(id), sc = scope) =>
    rpc(db, "ai_processing_receive", {
      p_scope: sc,
      p_external_id: id,
      p_type: "message",
      p_order: order,
      p_payload: "encrypted-fixture",
      p_replayable: true,
    });
  const claim = (id, token = crypto.randomUUID()) =>
    rpc(db, "ai_processing_claim", { p_event_id: id, p_token: token });
  const id = await receive("1");
  assert.equal(await receive("1"), id);
  const id2 = await receive("2");
  assert.equal(await claim(id2), null, "later queued event cannot overtake");
  const token = crypto.randomUUID();
  const c = await claim(id, token);
  assert(c);
  assert.equal(await claim(id), null);
  assert.equal(await claim(id2), null, "conversation serializes active claims");
  await assert.rejects(
    rpc(db, "ai_processing_assert", {
      p_event_id: id,
      p_token: crypto.randomUUID(),
    }),
    /lease_conflict/,
  );
  const limits = { modelCalls: 4, totalTokens: 80000 };
  const runtime = {
    id: c.run.id,
    startedAt: Date.now(),
    budget: limits,
    counts: { model: 1, reservedTokens: 1000 },
  };
  await rpc(db, "ai_processing_update", {
    p_event_id: id,
    p_token: token,
    p_patch: { runtime, stage: "model_started" },
  });
  await db.query(
    "update ai_inbound_events set lease_until=now()-interval '1 second' where id=$1",
    [id],
  );
  const token2 = crypto.randomUUID();
  const recovered = await claim(id, token2);
  assert.equal(recovered.event.attempts, 2);
  assert.deepEqual(recovered.run.runtime, runtime);
  await assert.rejects(
    rpc(db, "ai_processing_update", {
      p_event_id: id,
      p_token: token,
      p_patch: { stage: "completed" },
    }),
    /lease_conflict/,
  );
  await assert.rejects(
    rpc(db, "ai_processing_update", {
      p_event_id: id,
      p_token: token2,
      p_patch: {
        runtime: { ...runtime, counts: { model: 0, reservedTokens: 0 } },
      },
    }),
    /budget_reset/,
  );
  const draft = {
    id: crypto.randomUUID(),
    type: "create_order",
    phase: "collecting",
    fields: { quantity: 2 },
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };
  const saveArgs = {
    p_event_id: id,
    p_token: token2,
    p_key: "draft:0",
    p_user_id: owner,
    p_id: c.event.conversation_id,
    p_revision: 0,
    p_draft: draft,
    p_mode: "ai_active",
  };
  const first = await rpc(db, "ai_processing_save_draft", saveArgs);
  assert.deepEqual(await rpc(db, "ai_processing_save_draft", saveArgs), first);
  assert.equal(first.revision, 1, "duplicate task save is one transition");
  const delivery = await rpc(db, "ai_delivery_begin", {
    p_event_id: id,
    p_token: token2,
    p_key: "answer",
    p_channel: "telegram",
    p_type: "sendMessage",
    p_request: "encrypted",
    p_retry_safe: false,
  });
  assert(delivery.dispatch);
  await db.query(
    "update ai_inbound_events set lease_until=now()-interval '1 second' where id=$1",
    [id],
  );
  const token3 = crypto.randomUUID();
  await claim(id, token3);
  const unknown = await rpc(db, "ai_delivery_begin", {
    p_event_id: id,
    p_token: token3,
    p_key: "answer",
    p_channel: "telegram",
    p_type: "sendMessage",
    p_request: "encrypted",
    p_retry_safe: false,
  });
  assert.equal(unknown.state, "unknown");
  assert.equal(
    unknown.dispatch,
    false,
    "uncertain send cannot be dispatched twice",
  );
  await rpc(db, "ai_processing_finish", {
    p_event_id: id,
    p_token: token3,
    p_state: "completed",
    p_category: null,
  });
  assert.equal(
    (await db.query("select state from ai_inbound_events where id=$1", [id]))
      .rows[0].state,
    "delivery_unknown",
  );
  assert(await claim(id2));
  const late = await receive("0");
  assert.equal(await claim(late), null); // waits behind the active conversation
  // Quota contention: independent runs use the same serialized tenant reservation.
  await db.query(
    "update ai_business_limits set monthly_message_limit=1 where user_id=$1",
    [owner],
  );
  // Use the live claim's lease for the reservation owner/run check.
  const active = (
    await db.query("select lease_token from ai_inbound_events where id=$1", [
      id2,
    ])
  ).rows[0];
  const quotaArgs = {
    p_user_id: owner,
    p_run_id: (
      await db.query(
        "select id from ai_processing_runs where inbound_event_id=$1",
        [id2],
      )
    ).rows[0].id,
    p_kind: "chat",
    p_provider: "fixture",
    p_model: "fixture",
    p_tokens: 1000,
    p_event_id: id2,
    p_token: active.lease_token,
  };
  const reservations = await Promise.allSettled(
    ["a", "b"].map((p_key) =>
      rpc(db, "ai_usage_reserve", { ...quotaArgs, p_key }),
    ),
  );
  assert.equal(reservations.filter((r) => r.status === "fulfilled").length, 1);
  const reservation = reservations.find((r) => r.status === "fulfilled").value;
  await rpc(db, "ai_usage_reconcile", {
    p_id: reservation,
    p_input: null,
    p_output: null,
    p_cached: null,
  });
  assert.equal(
    (
      await db.query("select state from ai_usage_reservations where id=$1", [
        reservation,
      ])
    ).rows[0].state,
    "unknown",
  );
  await assert.rejects(
    rpc(db, "ai_usage_reserve", { ...quotaArgs, p_key: "c" }),
    /quota_messages/,
  );
  await rpc(db, "ai_usage_reconcile", {
    p_id: reservation,
    p_input: 120,
    p_output: 30,
    p_cached: 10,
  });
  await rpc(db, "ai_usage_reconcile", {
    p_id: reservation,
    p_input: 120,
    p_output: 30,
    p_cached: 10,
  });
  assert.equal(
    (await db.query("select count(*)::int n from ai_usage_log")).rows[0].n,
    1,
  );
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    for (const table of [
      "ai_inbound_events",
      "ai_processing_runs",
      "ai_run_events",
      "ai_outbound_deliveries",
      "ai_usage_reservations",
    ])
      await assert.rejects(
        db.query(`select * from ${table}`),
        /permission denied/,
      );
    await assert.rejects(receive("99"), /permission denied/);
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  await receive("service", null, {
    ...scope,
    conversationKeyHash: "c".repeat(64),
  });
  await db.exec("reset role");
  await db.close();
  console.log(
    "Phase 3 SQL passed: rerun, duplicate receipt, ordering, lease expiry/fencing, budget reset rejection, task CAS replay, ambiguous send, quota contention/reconciliation and role denial.",
  );
}
