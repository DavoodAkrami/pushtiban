import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Module = require("module");
const ts = require("typescript");
const root = process.cwd();
require.extensions[".ts"] = (module, filename) => {
  const source = fs
    .readFileSync(filename, "utf8")
    .replace('import "server-only";', "");
  module._compile(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
      fileName: filename,
    }).outputText,
    filename,
  );
};
const originalLoad = Module._load;
const load = (p) => require(path.join(root, "src/lib", p));
const budget = load("ai/runtime/budget.ts");
const context = load("ai/runtime/context.ts");
const tasks = load("ai/runtime/tasks.ts");
const { createTelegramProgress } = load("telegram/progress.ts");
const core = load("ai/actions/core.ts");
const rows = new Map();
const executions = new Map();
let lookup = false;
let baselineRag = null;
let mutations = 0;
let nextAction = null;
let calls = [];
let prompts = [];
let toolTimeouts = 0;
const owner = "11111111-1111-4111-8111-111111111111";
const connection = "22222222-2222-4222-8222-222222222222";
const actionContext = (channel) => ({
  channel,
  connectionId: connection,
  customerExternalId: "42",
  conversationId: "42",
  deliveryId: crypto.randomUUID(),
});
const clone = (value) => structuredClone(value);
const store = {
  claim: async (input) => {
    const old = [...executions.values()].find(
      (v) => v.idempotencyKey === input.idempotencyKey,
    );
    if (old) return { created: false, execution: clone(old) };
    const execution = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    executions.set(execution.id, execution);
    return { created: true, execution: clone(execution) };
  },
  findByIdempotency: async (user, key) =>
    clone(
      [...executions.values()].find(
        (v) => v.userId === user && v.idempotencyKey === key,
      ) ?? null,
    ),
  findPending: async (scope) =>
    clone(
      [...executions.values()]
        .reverse()
        .find(
          (v) =>
            v.status === "pending_confirmation" &&
            v.channel === scope.channel &&
            v.customerIdentityHash === scope.customerIdentityHash,
        ) ?? null,
    ),
  markExecuting: async (id) => {
    const row = executions.get(id);
    if (row.status !== "pending_confirmation") return false;
    row.status = "executing";
    return true;
  },
  markSucceeded: async (id, result) =>
    Object.assign(executions.get(id), { status: "succeeded", result }),
  markFailed: async (id) =>
    Object.assign(executions.get(id), { status: "failed" }),
  markExpired: async (id) =>
    Object.assign(executions.get(id), { status: "expired" }),
  claimStaleExecution: async () => false,
};
const schema = {
  parse: (value) =>
    value && typeof value === "object"
      ? { success: true, data: value }
      : { success: false },
};
const definition = core.defineAction({
  key: "create_order",
  name: "Order",
  description: "Prepare an order",
  modelArguments: {
    product_query: "string",
    quantity: "number",
    customer_values: "object",
  },
  inputSchema: schema,
  resultSchema: schema,
  confirmation: { required: true, prompt: "تأیید می‌کنید؟" },
  verification: "none",
  settings: {
    displayName: "Order",
    description: "Order",
    defaultEnabled: true,
  },
  intentGuard: (text) => /سفارش|buy/.test(text),
  isEnabled: async () => true,
  prepare: async (_ctx, input) => ({ success: true, data: input }),
  execute: async () => {
    mutations++;
    return { ok: true };
  },
  formatResult: () => "ثبت شد.",
});
const definitions = new Map([["create_order", definition]]);
const engine = core.createActionEngine({
  definitions,
  store,
  authorizeContext: async () => true,
  verifyCustomer: async () => true,
  resolveConfiguration: async () => ({
    enabled: true,
    requireConfirmation: true,
  }),
});
const slots = ["name", "address", "city", "note"].map((label, index) => ({
  slot: `field_${index + 1}`,
  label,
  type: "text",
  required: true,
  options: [],
}));
const client = {
  chat: {
    completions: {
      create: async (body, options) => {
        if (!baselineRag)
          assert.equal(
            options.maxRetries,
            0,
            "SDK retries cannot bypass runtime accounting",
          );
        const planner = body.temperature === 0;
        calls.push(planner ? "planner" : "answer");
        prompts.push(body.messages);
        if (!planner && body.tools && toolTimeouts > 0) {
          toolTimeouts--;
          throw new Error("Request timed out");
        }
        return {
          choices: [
            {
              message: {
                content: planner
                  ? JSON.stringify({
                      category: "general",
                      confidence: 1,
                      knowledgeNeeded: false,
                      businessDataLookup: lookup
                        ? { collection: "products", query: "Nike Jordan" }
                        : null,
                      action: nextAction,
                    })
                  : "سلام، چطور کمک کنم؟",
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        };
      },
    },
  },
};
const admin = {
  rpc: async (name, args) => {
    if (name === "ai_runtime_load") {
      const key = [
        args.p_user_id,
        args.p_channel,
        args.p_connection_id,
        args.p_customer_hash,
        args.p_conversation_hash,
      ].join(":");
      if (!rows.has(key))
        rows.set(key, {
          id: crypto.randomUUID(),
          revision: 0,
          mode: "ai_active",
          draft: null,
        });
      return { data: clone(rows.get(key)), error: null };
    }
    if (name === "ai_runtime_save") {
      const row = [...rows.values()].find((r) => r.id === args.p_id);
      if (!row || row.revision !== args.p_revision)
        return { data: null, error: { code: "40001" } };
      Object.assign(row, {
        revision: row.revision + 1,
        draft: clone(args.p_draft),
        mode: args.p_mode,
      });
      return { data: clone(row), error: null };
    }
    throw new Error(name);
  },
  from: () => ({
    select() {
      return this;
    },
    eq() {
      return this;
    },
    order() {
      return this;
    },
    limit: async () => ({ data: [] }),
  }),
};
Module._load = (name, parent, isMain) => {
  if (name === "@/configs")
    return {
      getOpenAIClient: () => client,
      getNvidiaNimClient: () => null,
      isOpenAIConfigured: () => true,
      isNvidiaNimConfigured: () => false,
      isEmbeddingsConfigured: () => false,
      providerForChatModel: () => null,
    };
  if (name === "@/lib/supabase/admin")
    return { createAdminClient: () => admin };
  if (name === "@/lib/ai/usage")
    return {
      getGlobalAiSettings: async () => ({
        aiEnabled: true,
        intentEnabled: true,
        chatModel: "",
      }),
      checkAiLimits: async () => ({ allowed: true }),
      logAiUsage: async () => {},
    };
  if (name === "@/lib/ai/availability")
    return { isAssistantChannelEnabled: async () => true };
  if (name === "@/lib/ai/persona")
    return {
      DEFAULT_PERSONA: {},
      REPLY_FORMAT_LINE: "Reply briefly.",
      buildPersonaIdentity: () => "Shop",
      buildPersonaLines: () => [],
      getBusinessPersona: async () => ({}),
    };
  if (name === "@/lib/business-data/ai-retrieval")
    return {
      getBusinessDataAiCapabilities: async () =>
        lookup ? [{ key: "products" }] : [],
      describeBusinessDataAiCapabilities: () =>
        lookup ? '[{"key":"products"}]' : "",
      lookupBusinessData: async () => ({
        collectionName: "Products",
        matchedCount: 1,
        records: [{ name: "Nike Jordan", price: 10 }],
      }),
    };
  if (name === "@/lib/business-data/private-access")
    return {
      getPrivateBusinessDataCapabilities: async () => [],
      describePrivateBusinessDataCapabilities: () => "",
    };
  if (name === "@/lib/ai/embeddings") return { embedQuery: async () => null };
  if (name === "../actions/registry" || name === "@/lib/ai/actions/registry")
    return {
      ACTION_REGISTRY: definitions,
      listSafeActionSettings: async () => [
        {
          key: "create_order",
          enabled: true,
          capabilityAvailable: true,
          configuration: { customerFields: slots },
        },
      ],
      describeAvailableActions: async () =>
        JSON.stringify([
          { key: "create_order", arguments: definition.modelArguments },
        ]),
      describeRelevantActionFollowUp: () => "",
    };
  if (name === "@/lib/ai/rag" && baselineRag) return baselineRag;
  if (name === "@/lib/ai/actions/server")
    return { executeModelAction: (input) => engine.executeRequested(input) };
  if (name === "../actions/server")
    return { executeModelAction: (input) => engine.executeRequested(input) };
  if (name.startsWith("@/"))
    return originalLoad(path.join(root, "src", name.slice(2)), parent, isMain);
  return originalLoad(name, parent, isMain);
};
try {
  const { generateAssistantReply } = load("ai/assistant.ts");
  const { runConversation } = load("ai/runtime/orchestrator.ts");
  const { conversationScope } = load("ai/runtime/store.ts");
  const metrics = [];
  for (const channel of ["telegram", "instagram", "preview"]) {
    const options =
      channel === "preview"
        ? { previewSession: crypto.randomUUID() }
        : { channel, actionContext: actionContext(channel) };
    const turns = [
      ["میخوام Nike Jordan سفارش بدم", { product_query: "Nike Jordan" }],
      ["تعداد 2", { quantity: 2 }],
      ["مریم", { customer_values: { field_1: "مریم" } }],
      ["خیابان آزادی", { customer_values: { field_2: "خیابان آزادی" } }],
      ["تهران", { customer_values: { field_3: "تهران" } }],
      ["تعداد 3", { quantity: 3 }],
      ["آدرس خیابان ولیعصر", { customer_values: { field_2: "خیابان ولیعصر" } }],
      ["نام سارا", { customer_values: { field_1: "سارا" } }],
      ["عصر ارسال شود", { customer_values: { field_4: "عصر ارسال شود" } }],
    ];
    let result;
    for (const [text, patch] of turns) {
      nextAction = { key: "create_order", arguments: patch };
      calls = [];
      result = await generateAssistantReply(text, owner, {
        ...options,
        handoffEnabled: false,
        history: [],
      });
      assert.equal(result.run.budgetExhausted, false);
      assert.deepEqual(
        calls,
        ["planner"],
        "field collection uses the existing planner, no answer/summarizer call",
      );
      assert.equal(
        mutations,
        channel === "telegram" ? 0 : channel === "instagram" ? 1 : 2,
      );
    }
    const row = [...rows.values()].at(-1);
    assert.equal(row.draft.fields.product_query, "Nike Jordan");
    assert.equal(row.draft.fields.quantity, 3);
    assert.equal(row.draft.fields.customer_values.field_1, "سارا");
    assert.equal(row.draft.fields.customer_values.field_2, "خیابان ولیعصر");
    assert.equal(row.draft.fields.customer_values.field_3, "تهران");
    assert.equal(row.draft.missingFields.length, 0);
    metrics.push({
      scenario: `${channel}: 9-turn order`,
      modelCallsPerTurn: result.run.counts.model,
      plannerCalls: result.run.counts.planner,
      toolCalls: result.run.counts.tool,
      loggedInput: result.run.counts.loggedInput,
      loggedOutput: result.run.counts.loggedOutput,
      budgetHit: result.run.budgetExhausted,
    });
    if (channel !== "preview") {
      assert.equal(result.action.status, "pending_confirmation");
      const ctx = {
        ...options.actionContext,
        userId: owner,
        customerMessage: "بله",
        deliveryId: crypto.randomUUID(),
      };
      const before = mutations;
      const confirmed = await runConversation({
        scope: conversationScope(ctx),
        message: "بله",
        execute: async () => {
          const r = await engine.confirmPending({
            context: ctx,
            message: "بله",
            expectedExecutionId: result.action.executionId,
          });
          return {
            text: r.text,
            needsHuman: false,
            action: { key: r.actionKey, status: r.status },
          };
        },
      });
      assert.equal(confirmed.action.status, "succeeded");
      assert.equal(mutations, before + 1);
      assert.equal(row.draft.phase, "completed");
      await engine.confirmPending({ context: ctx, message: "بله" });
      assert.equal(mutations, before + 1);
    }
  }
  nextAction = null;
  calls = [];
  const greeting = await generateAssistantReply("سلام", owner, {
    handoffEnabled: false,
    history: [],
  });
  assert.deepEqual(calls, ["planner", "answer"]);
  assert.equal(greeting.run.counts.model, 2);
  assert.equal(greeting.run.counts.planner, 1);
  toolTimeouts = 1;
  calls = [];
  const recoveredGreeting = await generateAssistantReply("سلام", owner, {
    channel: "telegram",
    actionContext: actionContext("telegram"),
    handoffEnabled: true,
    history: [],
  });
  assert.equal(recoveredGreeting.text, "سلام، چطور کمک کنم؟");
  assert.equal(recoveredGreeting.run.budgetExhausted, false);
  assert.deepEqual(calls, ["planner", "answer", "answer"]);
  metrics.push({
    scenario: "greeting",
    modelCalls: greeting.run.counts.model,
    plannerCalls: greeting.run.counts.planner,
    loggedInput: greeting.run.counts.loggedInput,
    loggedOutput: greeting.run.counts.loggedOutput,
  });
  lookup = true;
  calls = [];
  const product = await generateAssistantReply("Nike Jordan دارید؟", owner, {
    handoffEnabled: false,
  });
  assert.deepEqual(
    product.progress.map((e) => e.code),
    [
      "run_started",
      "thinking",
      "retrieval_started",
      "retrieval_completed",
      "generating_answer",
      "completed",
    ],
  );
  assert.deepEqual(calls, ["planner", "answer"]);
  const phase2Bytes = prompts
    .slice(-2)
    .reduce((n, p) => n + Buffer.byteLength(JSON.stringify(p)), 0);
  const compilePrevious = (file) => {
    const source = execFileSync("git", ["show", `9415b0d:${file}`], {
      encoding: "utf8",
    }).replace('import "server-only";', "");
    const baselineModule = new Module(path.join(root, file), import.meta);
    baselineModule.filename = path.join(root, file);
    baselineModule.paths = Module._nodeModulePaths(path.dirname(baselineModule.filename));
    baselineModule._compile(
      ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      }).outputText,
      baselineModule.filename,
    );
    return baselineModule.exports;
  };
  baselineRag = compilePrevious("src/lib/ai/rag.ts");
  const baseline = compilePrevious("src/lib/ai/assistant.ts");
  calls = [];
  await baseline.generateAssistantReply("Nike Jordan دارید؟", owner, {
    handoffEnabled: false,
  });
  assert.deepEqual(calls, ["planner", "answer"]);
  const phase1Bytes = prompts
    .slice(-2)
    .reduce((n, p) => n + Buffer.byteLength(JSON.stringify(p)), 0);
  metrics.push({
    scenario: "product lookup comparison against 9415b0d",
    phase1Calls: calls.length,
    phase2Calls: product.run.counts.model,
    phase1InputBytes: phase1Bytes,
    phase2InputBytes: phase2Bytes,
  });
  baselineRag = null;
  lookup = false;
  // New incomplete task, deterministic cancellation, stale state must be inactive.
  const options = {
    channel: "telegram",
    actionContext: {
      ...actionContext("telegram"),
      conversationId: "cancel-test",
    },
    handoffEnabled: false,
  };
  nextAction = {
    key: "create_order",
    arguments: { product_query: "Nike Jordan" },
  };
  await generateAssistantReply("Nike Jordan سفارش میخوام", owner, options);
  calls = [];
  await runConversation({
    scope: conversationScope({ ...options.actionContext, userId: owner, customerMessage: "بله" }),
    message: "بله",
    execute: async () => ({ text: "Available", needsHuman: false, action: { key: "check_availability", status: "succeeded" } }),
  });
  assert.equal([...rows.values()].at(-1).draft.phase, "collecting", "an unrelated successful capability cannot complete the draft");
  const cancelled = await generateAssistantReply("لغو", owner, options);
  assert.equal(cancelled.text, "درخواست لغو شد.");
  assert.equal(calls.length, 0);
  assert.equal([...rows.values()].at(-1).draft.phase, "cancelled");
  // Expired structured state is not injected into the planner.
  const row = [...rows.values()].at(-1);
  row.draft.phase = "collecting";
  row.draft.expiresAt = new Date(0).toISOString();
  nextAction = null;
  await generateAssistantReply("سلام", owner, options);
  assert.equal(row.draft.phase, "expired");
  const stale = await runConversation({
    scope: conversationScope({
      ...options.actionContext,
      userId: owner,
      customerMessage: "لغو",
    }),
    message: "لغو",
    expectedExecutionId: crypto.randomUUID(),
    execute: async () => {
      throw new Error("must not execute");
    },
  });
  assert.equal(stale.action.status, "rejected");
  row.mode = "human_active";
  calls = [];
  await generateAssistantReply("سلام", owner, options);
  assert.equal(calls.length, 0);
  // Malicious model-supplied field absent from the customer turn is rejected.
  const ungrounded = tasks.mergeTask({
    previous: null,
    type: "create_order",
    patch: { customer_values: { field_1: "invented" } },
    message: "سلام",
    required: ["field_1"],
    allowedSlots: ["field_1"],
  });
  const contact = tasks.mergeTask({
    previous: null,
    type: "create_order",
    patch: { quantity: 2, customer_values: { field_1: "[phone]" } },
    message: "دو تا، شماره ۰۹۱۲۱۲۳۴۵۶۷",
    required: ["field_1"],
    allowedSlots: ["field_1"],
  });
  assert.equal(contact.fields.quantity, 2);
  assert.equal(contact.fields.customer_values.field_1, "09121234567");
  assert(!context.taskContext(contact).includes("09121234567"));
  const secret = tasks.mergeTask({
    previous: null,
    type: "create_order",
    patch: { customer_values: { field_1: "123456" } },
    message: "کد تایید: 123456",
    required: ["field_1"],
    allowedSlots: ["field_1"],
  });
  assert.equal(secret.fields.customer_values.field_1, undefined);
  assert.equal(ungrounded.fields.customer_values.field_1, undefined);
  assert.deepEqual(ungrounded.missingFields, ["field_1"]);
  assert.equal(
    context.CONTEXT_POLICY.trim(
      Array.from({ length: 100 }, () => ({
        role: "user",
        text: "x".repeat(1000),
      })),
    ).reduce((n, v) => n + v.text.length, 0),
    600,
  );
  assert.deepEqual(
    context.usableEvidence(
      [
        {
          text: "secret",
          source: "retrieval",
          trust: "untrusted_data",
          privateScope: "A",
          expiresAt: new Date(0).toISOString(),
        },
      ],
      "A",
    ),
    [],
  );
  assert(!JSON.stringify(greeting.progress).includes("internal instructions"));
  assert.equal(prompts.at(-1)[0].role, "system");
  assert(
    !prompts.at(-1)[0].content.includes("Shop"),
    "business text is below platform instructions",
  );
  // Actual provider boundary refuses oversized contexts before dispatch.
  const provider = load("ai/runtime/provider.ts");
  let run = budget.createRun({ inputTokens: 600 });
  calls = [];
  await assert.rejects(
    budget.withRun(run, [], undefined, () =>
      provider.boundedCompletion(
        client,
        {
          model: "test",
          messages: [{ role: "user", content: "x".repeat(1000) }],
          max_tokens: 20,
        },
        { signal: new AbortController().signal },
      ),
    ),
    budget.RunBudgetExceeded,
  );
  assert.equal(calls.length, 0);
  // Loop-inducing decision source is terminated by the server-owned tool budget.
  const { runDecisions } = load("ai/runtime/capability.ts");
  run = budget.createRun({ toolCalls: 2 });
  let invoked = 0;
  await assert.rejects(
    budget.withRun(run, [], undefined, () =>
      runDecisions(
        async () => ({ type: "capability", name: "again", input: {} }),
        async () => {
          invoked++;
          return "continue";
        },
      ),
    ),
    budget.RunBudgetExceeded,
  );
  assert.equal(invoked, 2);
  const exhaustedResult = await runConversation({
    message: "loop",
    execute: async () => {
      await runDecisions(
        async () => ({ type: "capability", name: "again", input: {} }),
        async () => "continue",
      );
      return { text: "must not reach", needsHuman: false };
    },
  });
  assert.equal(exhaustedResult.run.budgetExhausted, true);
  assert.equal(exhaustedResult.progress.at(-1).code, "failed");
  for (const limits of [
    { modelCalls: 1 },
    { plannerCalls: 1 },
    { retries: 0 },
    { outputTokens: 20 },
    { totalTokens: 600 },
  ]) {
    const limited = budget.createRun(limits);
    await assert.rejects(
      budget.withRun(limited, [], undefined, async () => {
        for (let n = 0; n < 5; n++)
          budget.reserveModel({ text: "hello" }, 20, true);
      }),
      budget.RunBudgetExceeded,
    );
  }
  const safeSink = await runConversation({
    message: "hello",
    onProgress: async () => {
      throw new Error("transport down");
    },
    execute: async () => ({ text: "canonical", needsHuman: false }),
  });
  assert.equal(safeSink.text, "canonical");

  run = budget.createRun({ durationMs: 1 }, Date.now() - 10);
  assert.throws(() => budget.takeStep("model", run), budget.RunDeadlineExceeded);
  // One editable status message consumes arbitrary server text without interpretation.
  let now = 0;
  const operations = [];
  const adapter = createTelegramProgress(
    {
      send: async (text) => {
        operations.push(["send", text]);
        return 1;
      },
      edit: async (id, text) => operations.push(["edit", id, text]),
      remove: async (id) => operations.push(["remove", id]),
    },
    () => now,
  );
  const events = [];
  run = budget.createRun();
  await budget.withRun(run, events, undefined, async () => {
    await budget.emitProgress("run_started");
    await budget.emitProgress("retrieval_started", "products");
    await budget.emitProgress("retrieval_completed", "products");
    await budget.emitProgress("generating_answer");
    await budget.emitProgress("completed");
  });
  for (const event of events) {
    now += 1000;
    await adapter.consume({
      ...event,
      display_text: `SERVER:${event.sequence}`,
    });
  }
  await adapter.finish();
  assert.equal(operations.filter((v) => v[0] === "send").length, 1);
  assert.equal(operations.filter((v) => v[0] === "edit").length, 4);
  assert(
    operations
      .filter((v) => v[0] !== "remove")
      .every((v) => String(v.at(-1)).startsWith("SERVER:")),
  );
  assert.deepEqual(
    events.map((e) => e.sequence),
    [1, 2, 3, 4, 5],
  );
  assert(
    !fs
      .readFileSync("src/lib/telegram/processor.ts", "utf8")
      .includes('action: "typing"'),
  );
  console.log(
    JSON.stringify(
      {
        passed: "Phase 2 runtime and channel regression scenarios",
        metrics,
        tokenNote:
          "Provider usage is deterministic mocked usage, not production token measurement.",
      },
      null,
      2,
    ),
  );
} finally {
  Module._load = originalLoad;
}
