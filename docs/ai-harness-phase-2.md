# Phase 2 implementation and manual review

Branch: `codex/ai-harness-phase-2`, based on Phase 1 commit `9415b0d`.
Changes are local only. No push, merge or production schema deployment.

## Implementation map

| Module | Responsibility |
| --- | --- |
| `src/lib/ai/runtime/contracts.ts` | Conversation, modes, events, drafts, decisions, capability, context and budget types |
| `runtime/orchestrator.ts` | Shared run lifecycle, state loading, expiry/cancellation, mode checks, final outcomes |
| `runtime/store.ts` | Tenant/channel scope and Supabase load/CAS persistence |
| `runtime/tasks.ts` | Grounded partial field merge, corrections, fixed expiry and terminal clearing |
| `runtime/action.ts` | Current capability configuration, missing-field responses, deterministic Action-engine delegation |
| `runtime/budget.ts`, `provider.ts` | Server-owned counters, token reservations, deadlines and provider retry control |
| `runtime/context.ts` | History trimming, task context, lower-priority business data and future evidence-expiry hook |
| `runtime/capability.ts` | Typed authorized capability execution and bounded continuation interface |
| `src/lib/ai/assistant.ts`, `rag.ts`, `embeddings.ts` | Existing planner/retrieval/answer path connected to state, budgets and events |
| `src/lib/ai/actions/{core,business,server}.ts` | Server-grounded customer fields and runtime-aware confirmation |
| `src/lib/telegram/progress.ts`, Telegram webhook | One editable progress message; canonical delivery stays independent |
| Preview route and existing preview pane | Isolated persistent session, shared task collection, returned safe timeline/counters |
| `supabase/ai-runtime.sql` | Server-only conversation table, CAS functions and confirmation execution guard |

Instagram already calls the shared assistant and confirmation entry points;
it inherits the runtime without duplicating task logic in its webhook.

## Durable behavior and safety

The conversation stores one current TaskDraft, independently of short prose
memory. The draft contains a stable ID, type, grounded fields, missing fields,
product query reference, phase, version, configuration fingerprint, timestamps,
expiry and server confirmation reference. It holds no authoritative price,
stock, execution proof or verified identity. Supported drafts are order and
reservation creation. Existing cancellation/verification actions still run
through the registered Action engine.

Each partial patch is grounded in the current message and restricted to current
configured slots. Older values persist without replaying old customer messages.
Corrections update the same draft. Dataset changes invalidate its interpretation.
Contact placeholders can be resolved from a single matching value in the current
message on the server; raw contact data does not enter task model context.
Labeled verification codes are never unmasked. Quantity supports digits and
common Persian number words. Extraction still depends on the existing planner;
live linguistic evaluation remains part of manual acceptance.

Atomic version checks prevent lost state writes. Corrections and cancellation
invalidate pending confirmations in the same SQL transaction. The confirmation
claim checks mode, draft identity/reference, phase and expiry in PostgreSQL.
Stale inline buttons cannot confirm or cancel a newer draft. Existing server
permission, schema, stock/price, verification and idempotency checks are retained.
An executing action cannot be retroactively cancelled by a draft update.

Draft expiry is a fixed 30 minutes from creation; pending Actions retain their
existing five-minute confirmation TTL. Terminal drafts clear collected values.
Cold expired rows are ignored but not physically purged until a future retention
job is configured.

Modes support AI active, handoff pending, human active and resolved. The runtime
blocks active human modes. Full synchronization with every existing inbox event
is deferred to the handoff phase; channel-level handoff mechanics are retained.

## Runtime and exact limits

The existing bounded planner → retrieval → Action or answer pipeline remains the
production decision path. An ordinary question does not enter a new recursive
agent loop. Each model, retry, retrieval, capability and clarification consumes
server-owned limits. A continuation interface is available for future complex
cases, with a hard step ceiling and capability budget; models cannot configure
limits. Exhaustion terminates with a deterministic safe response.

Defaults per run:

- 4 completion attempts total, including at most 2 planner attempts.
- 4 capability invocations, 3 retrieval operations, 2 retries/repair attempts.
- 1 clarification and 12 counted steps (a planner counts against both model
  and planner allowances).
- 24,000 conservative input-token allowance per completion.
- 2,800 reserved output tokens and 80,000 reserved total input/output allowance.
- 55-second deadline, applied before work and to remaining provider timeouts.
- Existing per-completion output limits: 100/240/480 planner; 700 answer.

Input reservation uses serialized UTF-8 bytes plus 512 protocol allowance. This
is deliberately conservative, not a tokenizer measurement. Failed attempts keep
their reservations. SDK retries are disabled; explicit failover remains and is
counted. Query embeddings reserve input. Database and delivery operations are
not a full cancellable distributed workflow; Phase 3 remains necessary.

History stays at four turns / 600 characters. Task fields are bounded to 1,600
serialized characters, and model task context to 2,000. Platform rules remain
system instructions; business/persona/retrieval data goes into lower-priority
messages. Current private retrieval still owns verification scope and expiry.
No summary model call or full-history replay was added.

## Progress and API contract

Progress is server-generated Persian text attached to a run ID, sequence,
code/type, timestamp and allowlisted operation metadata. It never serializes
model reasoning, prompts, customer identifiers, tool arguments or private records.
The same events array and asynchronous callback can feed future SSE, streaming
HTTP or SDK clients. No public API was introduced.

Telegram sends one progress message, edits it at meaningful transitions with a
900 ms coalescing interval, then removes it before canonical delivery. It edits
failure into a safe message. Progress failures cannot hide cards, action prompts
or final answers. No AI typing indicator remains. Instagram chooses its existing
presentation. Preview returns the complete safe timeline without adding a new
Phase 5 timeline UI. Preview collects drafts but cannot execute real mutations
or prepare live confirmations.

## Validation and cost evidence

Executed successfully:

- `npm run test:ai-harness-phase-2`: real shared assistant/planner/runtime code
  with mocked providers, business fixtures and a CAS store; nine-turn orders
  through Telegram, Instagram and preview; quantity/address/name corrections;
  empty prose history; cancellation, expiry, modes, exact-once engine mutation,
  grounded-field rejection, private-context expiry, budget exhaustion, token
  rejection, safe progress and one-message Telegram presentation.
- `npm run test:ai-runtime-sql`: local PostgreSQL via PGlite 0.5.8; migration
  applied twice, stale CAS rejection, invalidated confirmations, execution
  guard, expiry/completion, RLS and client-role denial.
- Phase 1 regression, AI Actions, Business Data AI/private, internal Actions.
- TypeScript, production webpack build, lint and whitespace checks.
- Lint: zero errors; 39 existing warnings.

The SQL runner uses a test-only temporary dependency, not a production package:

```sh
npm install --prefix /private/tmp/pushtiban-phase2-sql --no-audit --no-fund @electric-sql/pglite@0.5.8
npm run test:ai-runtime-sql
```

Alternatively set `PGLITE_MODULE` to an installed PGlite module path.

| Deterministic scenario | Before | Phase 2 |
| --- | --- | --- |
| Ordinary product lookup | 1 planner + 1 answer | 1 planner + 1 answer |
| Greeting with planner available | 1 planner + 1 answer | 1 planner + 1 answer |
| Field collection | Existing planner/Action path | 1 planner, zero answer calls |
| Final complete order turn | Existing planner/Action path | 1 planner + 1 capability; no answer call |
| Valid confirmation | Zero model calls | Zero model calls |
| Synthetic capability loop | Not applicable | Stops at configured limit |

The regression loads the previous implementation directly from commit `9415b0d`
for its product comparison: 4,240 versus 4,504 serialized input bytes (+6.2%),
with unchanged completion count. The overhead is the explicit trust boundary.
This is one controlled fixture, not a production-wide token benchmark. Mocked
provider usage validates counters (100 input / 20 output per fixture call); it
must not be read as actual Phase 2 token consumption. Normal cases did not
exhaust the budget; synthetic limits did.

A read-only aggregate of the latest 200 production usage records on 2026-09-09
provides a baseline: 112 intent calls averaged 1,713 input / 65 output tokens
(max input 4,542); 88 chat calls averaged 918 input / 77 output (max input 3,290).
These are historical samples, not paired Phase 1/2 measurements. No customer
messages were fetched for this comparison. Current deployed column types were
also inspected read-only. Live Phase 2 model costs and language behavior remain
unmeasured until SQL deployment and manual tests.

## Before approving a merge

1. Run the entire `supabase/ai-runtime.sql` file in the Supabase SQL Editor and
   confirm it succeeded. It has only been applied to a local test database.
   Until it exists, durable customer runs stop safely with a retry response.
2. Start this branch locally and test an enabled order dataset. Provide the
   product, quantity, name, address and other required fields over at least six
   messages. Correct quantity, address and name before confirming.
3. Verify one progress message is edited; product cards and confirmation buttons
   still arrive. Confirm stock/order changes exactly once after confirmation.
4. Correct a prepared order, then press its old confirm and cancel buttons.
   Neither should affect the new draft. Cancel an incomplete request with `لغو`.
5. Test five-minute confirmation expiry and 30-minute task expiry. No expired
   operation should execute. Try global/owner/channel disable before confirming.
6. Repeat the collection in Instagram and preview. Preview must not create an
   order. “New conversation” must start an isolated draft. Inspect the preview
   response for the safe progress timeline.
7. Test contact fields, Persian number words, real configured reservation fields,
   handoff behavior, and provider failover. Compare actual logged token usage.

Remaining Phase 3/4 work: distributed conversation serialization/event replay,
delivery retry/reconciliation, cold-state retention cleanup, full human-mode
lifecycle integration, richer extraction/evidence evaluations and advanced
context editing. The migration and live acceptance are intentionally pending;
Phase 2 is not marked shipped in ROADMAP.
