import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const Module = require("module");
const ts = require("typescript");
const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(directory, "..");

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8").replace('import "server-only";', "");
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

const { redactVerificationInput } = require(
  path.join(root, "src", "lib", "ai", "redaction.ts")
);

assert.equal(
  redactVerificationInput("شماره من ۰۹۱۲ ۱۲۳ ۴۵۶۷ و کد تایید: ۱۲۳۴ است."),
  "شماره من [phone] و کد تایید: [code] است.",
  "Persian digits are redacted before a private message reaches the model"
);
assert.equal(
  redactVerificationInput("Email: customer@example.com"),
  "Email: [email]",
  "email addresses are redacted before a private message reaches the model"
);

let openaiCalls = 0;
let nvidiaCalls = 0;
const attemptedModels = [];
const failedOpenAi = {
  chat: {
    completions: {
      create: async ({ model }) => {
        openaiCalls += 1;
        attemptedModels.push(model);
        throw new Error("OpenAI unavailable");
      },
    },
  },
};
const workingNvidia = {
  chat: {
    completions: {
      create: async ({ model }) => {
        nvidiaCalls += 1;
        attemptedModels.push(model);
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  category: "pricing",
                  confidence: 0.9,
                  searchQuery: "قیمت",
                  knowledgeNeeded: true,
                  privateDataRequested: false,
                  businessDataLookup: null,
                  privateDataLookup: null,
                  action: null,
                }),
              },
            },
          ],
          usage: { total_tokens: 1 },
        };
      },
    },
  },
};

const originalLoad = Module._load;
Module._load = (request, parent, isMain) => {
  if (request === "@/configs") {
    return {
      getOpenAIClient: () => failedOpenAi,
      getNvidiaNimClient: () => workingNvidia,
      isEmbeddingsConfigured: () => false,
    };
  }
  if (request === "@/lib/ai/embeddings") return { embedQuery: async () => [] };
  if (request === "@/lib/supabase/admin") return { createAdminClient: () => ({}) };
  if (request === "@/lib/ai/limits") return { FACTS_MAX_CHARS: 1, FACTS_MAX_COUNT: 1 };
  if (request === "@/lib/business-data/limits") {
    return {
      BUSINESS_DATA_LIMITS: {
        aiCapabilitySummaryChars: 3_600,
        privateCapabilitySummaryChars: 1_200,
      },
    };
  }
  if (request === "@/lib/ai/usage") {
    return {
      getGlobalAiSettings: async () => ({ intentEnabled: true }),
      logAiUsage: async () => undefined,
    };
  }
  if (request === "@/lib/ai/persona") return {};
  if (request === "@/lib/business-data/ai-retrieval") return {};
  if (request === "@/lib/business-data/private-access") return {};
  if (request === "@/lib/ai/actions/business-action-rules") {
    return { isBusinessMutationIntentMessage: () => false };
  }
  return originalLoad(request, parent, isMain);
};

const previousOpenAiModel = process.env.TELEGRAM_AI_OPENAI_MODEL;
const previousNvidiaModel = process.env.TELEGRAM_AI_NVIDIA_MODEL;
process.env.TELEGRAM_AI_OPENAI_MODEL = "phase-1-openai-model";
process.env.TELEGRAM_AI_NVIDIA_MODEL = "phase-1-nvidia-model";

try {
  const { extractIntent } = require(path.join(root, "src", "lib", "ai", "rag.ts"));
  const intent = await extractIntent("قیمت چقدر است؟");
  assert.equal(intent?.category, "pricing");
  assert.equal(openaiCalls, 1, "OpenAI is attempted first");
  assert.equal(nvidiaCalls, 1, "NVIDIA is attempted after an OpenAI failure");
  assert.deepEqual(attemptedModels, ["phase-1-openai-model", "phase-1-nvidia-model"]);
} finally {
  Module._load = originalLoad;
  if (previousOpenAiModel === undefined) delete process.env.TELEGRAM_AI_OPENAI_MODEL;
  else process.env.TELEGRAM_AI_OPENAI_MODEL = previousOpenAiModel;
  if (previousNvidiaModel === undefined) delete process.env.TELEGRAM_AI_NVIDIA_MODEL;
  else process.env.TELEGRAM_AI_NVIDIA_MODEL = previousNvidiaModel;
}

const telegramWebhook = fs.readFileSync(
  path.join(root, "src", "app", "api", "telegram", "webhook", "[botId]", "route.ts"),
  "utf8"
);
assert.match(
  telegramWebhook,
  /delivery &&\s+!aiReply\.action &&\s+delivery\.records\.length > 0/s,
  "business-data cards cannot hide an Action prompt or result"
);

const chatRoute = fs.readFileSync(
  path.join(root, "src", "app", "api", "ai", "chat", "route.ts"),
  "utf8"
);
const modelsRoute = fs.readFileSync(
  path.join(root, "src", "app", "api", "ai", "models", "route.ts"),
  "utf8"
);
assert.match(chatRoute, /const guard = await requireSiteAdmin\(\)/);
assert.match(chatRoute, /const parsedMessages = parseMessages\(messages\)/);
assert.match(modelsRoute, /const guard = await requireSiteAdmin\(\)/);

console.log("Validated Phase 1 AI harness privacy, planner failover, delivery priority, and diagnostic access controls.");
