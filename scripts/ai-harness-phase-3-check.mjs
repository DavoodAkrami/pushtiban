import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { performance } from "node:perf_hooks";
import {
  createProcessingDb,
  seed,
  rpc,
  owner,
  conn,
  scope,
} from "./ai-processing-sql-check.mjs";
const require = createRequire(import.meta.url),
  Module = require("module"),
  ts = require("typescript");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(
      fs.readFileSync(filename, "utf8").replaceAll('import "server-only";', ""),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
        fileName: filename,
      },
    ).outputText,
    filename,
  );
const db = await createProcessingDb();
await seed(db);
const timings = {};
const original = Module._load;
Module._load = (request, parent, isMain) => {
  if (request === "server-only") return {};
  if (request === "@/lib/supabase/admin")
    return {
      createAdminClient: () => ({
        from: (table) => {
          const filters = [];
          let selected = "*";
          const query = {
            select: (columns) => {
              selected = columns;
              return query;
            },
            eq: (key, value) => {
              filters.push([key, value]);
              return query;
            },
            maybeSingle: async () => {
              try {
                const rows = await db.query(
                  `select ${selected} from ${table} where ${filters.map(([key], i) => `${key}=$${i + 1}`).join(" and ")}`,
                  filters.map(([, value]) => value),
                );
                return { data: rows.rows[0] ?? null, error: null };
              } catch (e) {
                return { data: null, error: e };
              }
            },
          };
          return query;
        },
        rpc: async (name, args) => {
          const start = performance.now();
          try {
            return { data: await rpc(db, name, args), error: null };
          } catch (e) {
            return { data: null, error: { message: e.message, code: e.code } };
          } finally {
            (timings[name] ??= []).push(performance.now() - start);
          }
        },
      }),
    };
  if (request.startsWith("@/"))
    return original(path.resolve("src", request.slice(2)), parent, isMain);
  return original(request, parent, isMain);
};
process.env.SECRET_ENCRYPTION_KEY = Buffer.from(
  crypto.getRandomValues(new Uint8Array(32)),
).toString("base64");
const load = (p) => require(path.resolve("src/lib", p));
const worker = load("ai/processing/worker.ts"),
  ctx = load("ai/processing/context.ts"),
  budget = load("ai/runtime/budget.ts");
const { runConversation } = load("ai/runtime/orchestrator.ts");
const { boundedCompletion } = load("ai/runtime/provider.ts");
const { deliver } = load("ai/processing/delivery.ts");
const { retryDelay } = load("ai/processing/failures.ts");
const { createTelegramProgress } = load("telegram/progress.ts");
const state = async (id) =>
  (await db.query("select * from ai_inbound_events where id=$1", [id])).rows[0];
let sequence = 100;
const receive = async (channel = "telegram") =>
  worker.receiveEvent({
    scope: { ...scope, channel },
    externalId: String(sequence++),
    order: sequence,
    type: "message",
    payload: { text: "product lookup" },
  });
const claim = async (id) => {
  const token = crypto.randomUUID();
  const value = await rpc(db, "ai_processing_claim", {
    p_event_id: id,
    p_token: token,
  });
  assert(value);
  return { ...value, token, counters: {} };
};
const expire = async (id) =>
  db.query(
    "update ai_inbound_events set lease_until=now()-interval '1 second',available_at=now()-interval '1 second' where id=$1",
    [id],
  );
let calls = 0,
  sends = 0;
const model = {
  chat: {
    completions: {
      create: async () => {
        calls++;
        return {
          choices: [{ message: { content: "fixture reply" } }],
          usage: { prompt_tokens: 120, completion_tokens: 30 },
        };
      },
    },
  },
};
const execute = async () => {
  await boundedCompletion(
    model,
    {
      model: "fixture",
      messages: [{ role: "user", content: "product" }],
      max_tokens: 100,
    },
    { signal: AbortSignal.timeout(1000) },
    true,
    "fixture",
  );
  await boundedCompletion(
    model,
    {
      model: "fixture",
      messages: [{ role: "user", content: "answer" }],
      max_tokens: 100,
    },
    { signal: AbortSignal.timeout(1000) },
    false,
    "fixture",
  );
  return { text: "fixture reply", needsHuman: false };
};
const answer = () =>
  deliver({
    channel: "telegram",
    type: "answer",
    request: { text: "fixture reply" },
    send: async () => {
      sends++;
      return { status: 200, accepted: true, messageId: "42" };
    },
  });
// Same platform event, one runtime and one delivery. Delivery recovery reuses generation.
for (const channel of ["telegram", "instagram"]) {
  const id = await receive(channel);
  const e = await state(id);
  const duplicate = await worker.receiveEvent({
    scope: { ...scope, channel },
    externalId: e.external_id,
    order: Number(e.ordering_key),
    type: "message",
    payload: { text: "duplicate" },
  });
  assert.equal(duplicate, id);
  await worker.processEvent(id, async () => {
    await runConversation({
      scope: { ...scope, channel },
      message: "product",
      execute,
    });
    await answer();
  });
  const before = calls;
  await worker.processEvent(id, async () => {
    throw Error("duplicate must not run");
  });
  assert.equal(calls, before);
  assert.equal((await state(id)).state, "completed");
}
assert.equal(calls, 4);
assert.equal(sends, 2);
// Crash after generation, before delivery: recover with the original budget and cached result.
const crash = await receive();
const c = await claim(crash);
await ctx.withProcessing(c, () =>
  runConversation({ scope, message: "product", execute }),
);
const atCrash = calls;
await expire(crash);
await worker.processEvent(crash, async () => {
  const result = await runConversation({ scope, message: "product", execute });
  assert.equal(result.text, "fixture reply");
  await answer();
});
assert.equal(calls, atCrash);
assert.equal((await state(crash)).state, "completed");
// A model timeout has already consumed a call/token reservation, including after a process restart.
const timeout = await receive();
const tc = await claim(timeout);
const failing = {
  chat: {
    completions: {
      create: async () => {
        calls++;
        throw Error("Request timed out");
      },
    },
  },
};
await assert.rejects(
  ctx.withProcessing(tc, async () => {
    const r = budget.createRun();
    r.id = tc.run.id;
    await budget.withRun(r, [], undefined, () =>
      boundedCompletion(
        failing,
        {
          model: "fixture",
          messages: [{ role: "user", content: "hello" }],
          max_tokens: 100,
        },
        { signal: AbortSignal.timeout(1000) },
      ),
    );
  }),
  /timed out/,
);
const stored = (
  await db.query("select runtime from ai_processing_runs where id=$1", [
    tc.run.id,
  ])
).rows[0].runtime;
assert.equal(stored.counts.model, 1);
assert(stored.counts.reservedTokens > 0);
assert.equal(
  (
    await db.query("select state from ai_usage_reservations where run_id=$1", [
      tc.run.id,
    ])
  ).rows[0].state,
  "unknown",
);
await expire(timeout);
const resumed = await claim(timeout);
assert.equal(resumed.run.runtime.counts.model, 1);
await ctx.withProcessing(resumed, async () => {
  const r = resumed.run.runtime;
  await budget.withRun(r, [], undefined, async () => {
    for (let i = 0; i < 2; i++)
      await boundedCompletion(
        model,
        { model: "fixture", messages: [], max_tokens: 100 },
        { signal: AbortSignal.timeout(1000) },
      );
    await assert.rejects(
      boundedCompletion(
        model,
        { model: "fixture", messages: [], max_tokens: 100 },
        { signal: AbortSignal.timeout(1000) },
      ),
      budget.RunBudgetExceeded,
    );
  });
});
await rpc(db, "ai_processing_finish", {
  p_event_id: timeout,
  p_token: resumed.token,
  p_state: "permanently_failed",
  p_category: "budget_exhausted",
});
// Validation cannot trigger automatic retries; transient retries are bounded.
assert.equal(retryDelay("action_validation_failed", 1), null);
assert.equal(retryDelay("authorization_denied", 1), null);
assert.equal(retryDelay("provider_timeout", 4), null);
assert.equal(
  retryDelay("provider_timeout", 1, () => 0.5),
  5,
);
// Known rate-limit rejection can retry, but generation is not repeated.
const known = await receive();
let attempts = 0;
const generated = calls;
const knownTask = async () => {
  await runConversation({ scope, message: "product", execute });
  await deliver({
    channel: "telegram",
    type: "answer",
    request: { text: "answer" },
    send: async () =>
      ++attempts === 1
        ? { status: 429, accepted: false }
        : { status: 200, accepted: true, messageId: "77" },
  });
};
await worker.processEvent(known, knownTask);
assert.equal((await state(known)).state, "retryable_failed");
await expire(known);
await worker.processEvent(known, knownTask);
assert.equal((await state(known)).state, "completed");
assert.equal(calls - generated, 2);
assert.equal(attempts, 2);
// Changed routing/content cannot reuse a prior ordinal delivery identity.
const changedDelivery = await receive();
const changedContext = await claim(changedDelivery);
let changedSends = 0;
const sendChanged = (text) =>
  deliver({
    channel: "telegram",
    type: "answer",
    request: { text },
    send: async () => {
      changedSends++;
      return { status: 200, accepted: true, messageId: "78" };
    },
  });
await ctx.withProcessing(changedContext, () => sendChanged("original"));
await expire(changedDelivery);
await worker.processEvent(changedDelivery, () => sendChanged("changed"));
assert.equal((await state(changedDelivery)).state, "permanently_failed");
assert.equal(
  (await state(changedDelivery)).failure_category,
  "replay_unavailable",
);
assert.equal(changedSends, 1);
// Unknown network acceptance must never fall through to a different send or retry.
const ambiguous = await receive();
let ambiguousSends = 0;
await worker.processEvent(ambiguous, () =>
  deliver({
    channel: "instagram",
    type: "answer",
    request: { text: "answer" },
    send: async () => {
      ambiguousSends++;
      throw Error("connection reset");
    },
  }),
);
assert.equal((await state(ambiguous)).state, "delivery_unknown");
await worker.processEvent(ambiguous, () => {
  ambiguousSends++;
});
assert.equal(ambiguousSends, 1);
// Progress creation is independently journaled; a fresh adapter returns the same platform ID.
const progressId = await receive();
let progressSends = 0;
const pc = await claim(progressId);
const progressTransport = {
  send: async (text) => {
    const result = await deliver({
      channel: "telegram",
      type: "progress",
      key: "progress:create",
      request: { text },
      send: async () => {
        progressSends++;
        return { status: 200, accepted: true, messageId: "100" };
      },
    });
    return Number(result.messageId);
  },
  edit: async () => {},
  remove: async () => {},
};
const event = {
  run_id: pc.run.id,
  sequence: 1,
  code: "run_started",
  display_text: "در حال فکر کردن…",
};
await ctx.withProcessing(pc, () =>
  createTelegramProgress(progressTransport).consume(event),
);
await expire(progressId);
await worker.processEvent(progressId, async () => {
  const progress = createTelegramProgress(progressTransport);
  await progress.consume(event);
  await progress.finish();
});
assert.equal(progressSends, 1);
// SQL records enough hierarchy and measured usage to explain a normal successful run.
const trace = (
  await db.query(
    `select e.external_id,r.id,r.outcome,count(distinct ev.id)::int stages,count(distinct d.id)::int deliveries,count(distinct u.id)::int usage from ai_inbound_events e join ai_processing_runs r on r.inbound_event_id=e.id join ai_run_events ev on ev.run_id=r.id join ai_outbound_deliveries d on d.run_id=r.id join ai_usage_reservations u on u.run_id=r.id where e.external_id='100' group by e.external_id,r.id,r.outcome`,
  )
).rows[0];
assert.equal(trace.outcome, "completed");
assert(trace.stages >= 5);
assert.equal(trace.usage, 2);
const traceText = JSON.stringify(
  (await db.query("select * from ai_run_events")).rows,
);
assert(!traceText.includes("product lookup"));
assert(!traceText.includes("fixture reply"));
// Mutation transaction boundary: a deterministic ledger stands in for the existing
// idempotent Business Data RPC, while the production fence/confirmation RPCs run unchanged.
await db.exec(`create table phase3_orders(execution_id uuid primary key,quantity integer);
create function public.business_data_create_order_action(uuid,uuid,uuid,text,numeric,integer,jsonb) returns jsonb language plpgsql as $$ begin
 insert into public.phase3_orders values($2,$6) on conflict do nothing;
 return jsonb_build_object('status','created','reference',$2); end $$;`);
const actionScope = { ...scope, conversationKeyHash: "d".repeat(64) };
const actionEvent = await worker.receiveEvent({
  scope: actionScope,
  externalId: "action-crash-after",
  type: "callback",
  payload: {},
});
const ac = await claim(actionEvent);
const actionId = crypto.randomUUID();
const actionDraft = {
  id: crypto.randomUUID(),
  type: "create_order",
  phase: "confirmation_required",
  fields: { quantity: 2 },
  confirmation: { executionId: actionId },
  expiresAt: new Date(Date.now() + 300000).toISOString(),
};
await rpc(db, "ai_runtime_save", {
  p_user_id: owner,
  p_id: ac.event.conversation_id,
  p_revision: 0,
  p_draft: actionDraft,
  p_mode: "ai_active",
});
await db.query(
  "insert into business_action_executions(id,user_id,channel,connection_id,customer_identity_hash,conversation_key_hash,status,action_key,requires_confirmation,confirmation_expires_at) values($1,$2,'telegram',$3,$4,$5,'pending_confirmation','create_order',true,now()+interval '5 minutes')",
  [
    actionId,
    owner,
    conn,
    actionScope.customerIdentityHash,
    actionScope.conversationKeyHash,
  ],
);
assert.equal(
  await rpc(db, "ai_processing_action_claim", {
    p_event_id: actionEvent,
    p_token: ac.token,
    p_execution_id: actionId,
  }),
  true,
);
const mutateArgs = {
  p_event_id: actionEvent,
  p_token: ac.token,
  p_operation: "business_data_create_order_action",
  p_arguments: {
    p_user_id: owner,
    p_execution_id: actionId,
    p_product_record_id: crypto.randomUUID(),
    p_expected_product_reference: "fixture",
    p_expected_unit_price: 10,
    p_quantity: 2,
    p_customer_values: {},
  },
};
await rpc(db, "ai_processing_mutate", mutateArgs); // crash after the committed mutation, before application success audit
await expire(actionEvent);
const ar = await claim(actionEvent);
assert.equal(ar.run.action_execution_id, actionId);
await assert.rejects(
  rpc(db, "ai_processing_mutate", mutateArgs),
  /lease_conflict/,
);
await db.query(
  "update ai_assistant_settings set telegram_enabled=false where user_id=$1",
  [owner],
);
await assert.rejects(
  rpc(db, "ai_processing_mutate", { ...mutateArgs, p_token: ar.token }),
  /authorization_denied/,
);
await db.query(
  "update ai_assistant_settings set telegram_enabled=true where user_id=$1",
  [owner],
);
await rpc(db, "ai_processing_mutate", { ...mutateArgs, p_token: ar.token });
assert.equal(
  (await db.query("select count(*)::int n from phase3_orders")).rows[0].n,
  1,
  "crash after mutation does not create a second order",
);
await db.query(
  "update business_action_executions set status='succeeded' where id=$1",
  [actionId],
);
await rpc(db, "ai_processing_finish", {
  p_event_id: actionEvent,
  p_token: ar.token,
  p_state: "completed",
  p_category: null,
});
// Crash before mutation, then a valid recovered claim executes once.
const beforeEvent = await worker.receiveEvent({
  scope: actionScope,
  externalId: "action-crash-before",
  type: "callback",
  payload: {},
});
const bc = await claim(beforeEvent);
const secondAction = crypto.randomUUID();
await db.query(
  "insert into business_action_executions(id,user_id,channel,connection_id,customer_identity_hash,conversation_key_hash,status,action_key,requires_confirmation,confirmation_expires_at) values($1,$2,'telegram',$3,$4,$5,'pending_confirmation','create_order',true,now()+interval '5 minutes')",
  [
    secondAction,
    owner,
    conn,
    actionScope.customerIdentityHash,
    actionScope.conversationKeyHash,
  ],
);
await rpc(db, "ai_runtime_save", {
  p_user_id: owner,
  p_id: bc.event.conversation_id,
  p_revision: 1,
  p_draft: { ...actionDraft, confirmation: { executionId: secondAction } },
  p_mode: "ai_active",
});
await rpc(db, "ai_processing_action_claim", {
  p_event_id: beforeEvent,
  p_token: bc.token,
  p_execution_id: secondAction,
});
await expire(beforeEvent);
const br = await claim(beforeEvent);
const beforeArgs = {
  ...mutateArgs,
  p_event_id: beforeEvent,
  p_token: br.token,
  p_arguments: { ...mutateArgs.p_arguments, p_execution_id: secondAction },
};
await rpc(db, "ai_processing_mutate", beforeArgs);
assert.equal(
  (await db.query("select count(*)::int n from phase3_orders")).rows[0].n,
  2,
);
// Expired confirmation cannot execute again, even through recovery.
await db.query(
  "update business_action_executions set confirmation_expires_at=now()-interval '1 second' where id=$1",
  [secondAction],
);
await assert.rejects(
  rpc(db, "ai_processing_mutate", beforeArgs),
  /authorization_denied/,
);
await db.query(
  "update business_action_executions set status='succeeded' where id=$1",
  [secondAction],
);
await rpc(db, "ai_processing_finish", {
  p_event_id: beforeEvent,
  p_token: br.token,
  p_state: "completed",
  p_category: null,
});
// Ordering is by update ID among queued Telegram messages; a late lower ID is terminal.
const orderingScope = { ...scope, conversationKeyHash: "e".repeat(64) };
const firstOrdered = await worker.receiveEvent({
  scope: orderingScope,
  externalId: "o-20",
  order: 20,
  type: "message",
  payload: { quantity: 2 },
});
const secondOrdered = await worker.receiveEvent({
  scope: orderingScope,
  externalId: "o-21",
  order: 21,
  type: "message",
  payload: { quantity: 1 },
});
assert.equal(
  await rpc(db, "ai_processing_claim", {
    p_event_id: secondOrdered,
    p_token: crypto.randomUUID(),
  }),
  null,
);
for (const [id, quantity, revision] of [
  [firstOrdered, 2, 0],
  [secondOrdered, 1, 1],
]) {
  const oc = await claim(id);
  await rpc(db, "ai_processing_save_draft", {
    p_event_id: id,
    p_token: oc.token,
    p_key: "draft:0",
    p_user_id: owner,
    p_id: oc.event.conversation_id,
    p_revision: revision,
    p_draft: {
      ...actionDraft,
      phase: "collecting",
      fields: { quantity },
      confirmation: { executionId: null },
    },
    p_mode: "ai_active",
  });
  await rpc(db, "ai_processing_finish", {
    p_event_id: id,
    p_token: oc.token,
    p_state: "completed",
    p_category: null,
  });
}
const finalDraft = (
  await db.query(
    "select draft from ai_runtime_conversations where conversation_key_hash=$1",
    [orderingScope.conversationKeyHash],
  )
).rows[0].draft;
assert.equal(finalDraft.fields.quantity, 1);
const late = await worker.receiveEvent({
  scope: orderingScope,
  externalId: "o-19",
  order: 19,
  type: "message",
  payload: { quantity: 3 },
});
assert.equal(
  await rpc(db, "ai_processing_claim", {
    p_event_id: late,
    p_token: crypto.randomUUID(),
  }),
  null,
);
assert.equal((await state(late)).failure_category, "late_event");
// A lower update arriving during an interrupted newer attempt cannot deadlock
// both events: recover the attempted event, then reject the late update.
const interrupted = await worker.receiveEvent({
  scope: orderingScope,
  externalId: "o-30",
  order: 30,
  type: "message",
  payload: {},
});
await claim(interrupted);
const arrivedDuringRetry = await worker.receiveEvent({
  scope: orderingScope,
  externalId: "o-29",
  order: 29,
  type: "message",
  payload: {},
});
await expire(interrupted);
assert.equal(
  (await worker.processEvent(interrupted, async () => {})).claimed,
  true,
);
await worker.processEvent(arrivedDuringRetry, async () => {
  throw Error("late event must not execute");
});
assert.equal((await state(arrivedDuringRetry)).failure_category, "late_event");
// Terminal progress cleanup has its own bounded claim, independent of event replay.
const cleanupToken = crypto.randomUUID();
const cleanup = await rpc(db, "ai_processing_progress_cleanup_claim", {
  p_token: cleanupToken,
});
assert(cleanup);
await rpc(db, "ai_processing_progress_cleanup_finish", {
  p_id: cleanup.delivery.id,
  p_token: cleanupToken,
  p_success: true,
});
assert.equal(
  (
    await db.query(
      "select cleanup_state from ai_outbound_deliveries where id=$1",
      [cleanup.delivery.id],
    )
  ).rows[0].cleanup_state,
  "done",
);

// The memory/inbox journal is part of the production SQL transaction, not a
// best-effort flag written after an append.
await db.exec(`create table telegram_chat_sessions(telegram_connection_id uuid,chat_id bigint,turns jsonb,last_seen_at timestamptz,primary key(telegram_connection_id,chat_id));
create table instagram_chat_sessions(instagram_connection_id uuid,sender_id text,turns jsonb,last_seen_at timestamptz,primary key(instagram_connection_id,sender_id));
create table support_conversations(id uuid primary key default gen_random_uuid(),user_id uuid,channel text,telegram_connection_id uuid,instagram_connection_id uuid,customer_external_id text,customer_telegram_id bigint,customer_username text,customer_display_name text,status text,queued_reason text,last_customer_message_text text,last_customer_message_at timestamptz);
create table support_messages(id uuid primary key default gen_random_uuid(),conversation_id uuid,role text,content text,action_execution_id uuid unique);`);
const journalScope = {
  ...scope,
  conversationKeyHash: require("node:crypto")
    .createHash("sha256")
    .update(`telegram:${conn}:42`)
    .digest("hex"),
};
const journalEvent = await worker.receiveEvent({
  scope: journalScope,
  externalId: "journal",
  type: "message",
  payload: {},
});
const jc = await claim(journalEvent);
const memoryArgs = {
  p_event_id: journalEvent,
  p_token: jc.token,
  p_key: "memory:0",
  p_chat: "42",
  p_turns: [{ role: "user", text: "hello", at: Date.now() }],
};
await rpc(db, "ai_processing_memory", memoryArgs);
await rpc(db, "ai_processing_memory", { ...memoryArgs, p_turns: [] });
assert.equal(
  (await db.query("select turns from telegram_chat_sessions")).rows[0].turns
    .length,
  1,
);
const inboxArgs = {
  p_event_id: journalEvent,
  p_token: jc.token,
  p_key: "inbox:0",
  p_customer: "42",
  p_text: "support please",
  p_reason: "customer_request",
  p_username: null,
  p_display: null,
  p_execution: null,
};
const inbox = await rpc(db, "ai_processing_inbox", inboxArgs);
assert.equal((await rpc(db, "ai_processing_inbox", inboxArgs)).id, inbox.id);
assert.equal(
  (await db.query("select count(*)::int n from support_messages")).rows[0].n,
  1,
);
await rpc(db, "ai_processing_finish", {
  p_event_id: journalEvent,
  p_token: jc.token,
  p_state: "completed",
  p_category: null,
});
// A recovered run's elapsed 55-second deadline cannot become a new model budget.
const deadlineEvent = await receive();
const dc = await claim(deadlineEvent);
const callCount = calls;
await ctx.withProcessing(dc, async () => {
  const expiredRun = budget.createRun({}, Date.now() - 60000);
  expiredRun.id = dc.run.id;
  await ctx.persistBudget(expiredRun);
});
await expire(deadlineEvent);
await worker.processEvent(deadlineEvent, async () => {
  const result = await runConversation({ scope, message: "hello", execute });
  assert.match(result.text, /زمان مجاز/);
  assert.equal(result.run.budgetExhausted, false);
});
assert.equal(calls, callCount);
const failedRun = (
  await db.query(
    "select outcome,failure_category from ai_processing_runs where inbound_event_id=$1",
    [deadlineEvent],
  )
).rows[0];
assert.equal(failedRun.outcome, "failed");
assert.equal(failedRun.failure_category, "deadline_exceeded");

const storageBytes = (
  await db.query(
    `select 'events' as kind,count(*)::int rows,coalesce(sum(pg_column_size(e)),0)::int bytes from ai_inbound_events e union all select 'runs',count(*)::int,coalesce(sum(pg_column_size(r)),0)::int from ai_processing_runs r union all select 'traces',count(*)::int,coalesce(sum(pg_column_size(t)),0)::int from ai_run_events t union all select 'deliveries',count(*)::int,coalesce(sum(pg_column_size(d)),0)::int from ai_outbound_deliveries d`,
  )
).rows;
const latency = Object.fromEntries(
  Object.entries(timings).map(([name, values]) => [
    name,
    {
      calls: values.length,
      meanMs: +(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
      maxMs: +Math.max(...values).toFixed(2),
    },
  ]),
);
console.log(
  JSON.stringify(
    {
      passed: "Phase 3 real worker/runtime/provider + local PostgreSQL",
      normalProductModelCalls: 2,
      deliveryRetryExtraModelCalls: 0,
      timeoutAttemptsBounded: true,
      measuredFixtureTokensPerProduct: { input: 240, output: 60 },
      latency,
      storageBytes,
      latencyNote:
        "Local in-process PostgreSQL timings exclude Supabase network latency; tokens are mocked provider reports.",
    },
    null,
    2,
  ),
);
await db.close();
Module._load = original;
