# Phase 3: durable message processing

Status: implemented and validated locally on `codex/ai-harness-phase-3`.
Production migration, scheduler setup, channel acceptance testing, merge and push
are pending owner approval. Base: `5f6fbc8`, including Phase 2 (`72bb30f`) and the
approved timeout correction. The delivery message records the local commit hash;
`git log main..codex/ai-harness-phase-3 --oneline` lists the local commits.

## Scope and modules

This phase adds persistence around the existing bounded runtime. It does not add
model calls for reliability or change retrieval prompts, provider selection,
TaskDraft semantics, private verification rules or the business-action catalog.

| Area | Implementation |
| --- | --- |
| Schema, transactional claims and journals | `supabase/ai-processing.sql` |
| Receipt, worker, recovery | `src/lib/ai/processing/worker.ts`, `src/app/api/internal/ai-recovery/route.ts` |
| Lease context, checkpoints, classified errors | `src/lib/ai/processing/context.ts`, `failures.ts` |
| Delivery and replay authorization | `src/lib/ai/processing/delivery.ts`, `replay.ts` |
| Quota and minimized replay | `src/lib/ai/processing/usage.ts`, `privacy.ts` |
| Channel receipt/processing separation | `src/lib/telegram/processor.ts`, `src/lib/instagram/processor.ts`; thin existing webhook routes |
| Platform delivery/progress | `src/lib/telegram/transport.ts`, `progress.ts`, `progress-recovery.ts`, `src/lib/instagram/api.ts` |
| Persistent budgets and final results | `src/lib/ai/runtime/{orchestrator,store,budget,provider,capability}.ts` |
| Usage, actions and downstream boundaries | `src/lib/ai/{assistant,rag,embeddings,usage,memory,inbox}.ts`, `src/lib/ai/actions/{core,server,business}.ts` |
| Owner preview | `src/app/api/ai/preview/route.ts` |
| Regression evidence | `scripts/ai-harness-phase-3-check.mjs`, `scripts/ai-processing-sql-check.mjs`; existing source assertions follow the extracted processors |

## Receipt, lifecycle and ordering

The database hierarchy is:

```text
ai_runtime_conversations
  ai_inbound_events
    ai_processing_runs (one canonical run per event)
      ai_run_events
      ai_outbound_deliveries
      ai_usage_reservations -> ai_usage_log
      action_execution_id -> business_action_executions
```

Receipt creates the event and run in one transaction. A database unique constraint
on `(channel, connection_id, external_id)` prevents duplicate logical processing.
The receipt stores tenant, conversation, normalized type, ordering identity,
attempt/lease fields, timestamps and a minimized encrypted replay envelope.

| Event state | Meaning / next transition |
| --- | --- |
| `ready` | Persisted, not yet claimed; may become `processing` |
| `processing` | One current lease owner; may finish or schedule a retry |
| `retryable_failed` | Retry due at `available_at`; may become `processing` |
| `completed` | Handler finished; delivery records distinguish actual sends from no-response handling |
| `permanently_failed` | Deterministic rejection, expired recovery window or exhausted attempts; no automatic retry |
| `delivery_unknown` | A non-idempotent send might have succeeded; no automatic resend |

The run separately records stage, outcome, start/end, action reference, task
revision, runtime snapshot and safe checkpoints. A handled deterministic runtime
failure can have event `completed` (its failure reply was handled) and run outcome
`failed`. This distinguishes processing completion from successful AI execution.

Claims lock the conversation row, then the event row. A random token owns a
150-second lease. Fenced RPCs reject stale or expired tokens. Internal business
mutations hold this fence throughout their existing database transaction. There
is no lease renewal or indefinite lock: work is bounded by the existing 55-second
AI deadline and a 60-second route duration. A crashed attempt can be reclaimed
after lease expiry.

Only one nonterminal attempted event proceeds for a conversation. Telegram
`update_id` orders known queued arrivals. An interrupted attempt takes precedence
over a newly arriving lower update; after it finishes, the lower update becomes
`late_event`, preventing an old quantity from overwriting a newer correction.
The database cannot order messages it has not received. Instagram uses receipt
sequence, not an inferred ordering of opaque message IDs. Its IDs are namespaced
by message/comment; postbacks lacking an ID use sender, timestamp and payload.
Events without sufficient identity are ignored. The fallback can conflate
identical postbacks with the same timestamp; it is weaker than a platform ID.

Telegram authenticates its webhook secret before receipt and returns 200 after
persistence. Instagram verifies the raw-body HMAC, persists supported members of
a batch, then acknowledges; a persistence failure returns 503, and a redelivered
batch deduplicates already persisted members. Unknown connections, echoes and
unsupported events can still be acknowledged without creating AI work.

## Resume boundaries and budgets

Next.js `after()` starts the first attempt after acknowledgement. It is only an
execution opportunity. Postgres retains responsibility if that process stops.
The authenticated recovery endpoint supplies the independent retry mechanism.

| Boundary | Recovery behavior |
| --- | --- |
| Before paid model/embedding work | Persist counters and reserve quota first; uncertainty consumes the conservative allowance |
| Interrupted retrieval/planning | May repeat read-only work only within the original remaining budget/deadline |
| TaskDraft write | CAS and operation checkpoint commit together; the same operation returns its saved result |
| Confirmed action | Preserve execution ID, recheck current authorization and confirmation, reuse existing mutation idempotency |
| Generated public answer | Replay the encrypted final result after current-control checks; no extra model call |
| Generated private answer | Store a non-replayable marker in runtime checkpoints; require a fresh verified interaction |
| Memory/inbox append | Transactional journal prevents duplicate append/transition |
| Known successful delivery | Reuse the recorded acknowledgement; do not send again |
| Unknown non-idempotent delivery | Leave unresolved; never infer rejection from a dropped connection |

The original budget object, absolute `startedAt` and consumed counters survive
every worker attempt. SQL rejects changed budget/deadline or decreasing counters.
Limits remain: 4 model calls, 2 planner calls, 4 tools, 3 retrievals, 2 model
retries, 1 clarification, 12 steps, 24,000 input-token upper bound per request,
2,800 reserved output tokens, 80,000 total reserved tokens and 55 seconds elapsed.
Conservative byte-based estimates are bounds, not provider usage measurements.

A crash followed by a 150-second lease wait normally exhausts the AI deadline.
Recovery then delivers an already generated answer, reconciles an already linked
idempotent action without model work, or terminates with the deterministic timeout
reply. It does not grant another 55 seconds of generation. This deliberately
prioritizes the Phase 2 budget guarantee over completing every interrupted answer.

An event gets at most four worker attempts within 30 minutes of receipt. Transient
failures use approximately 5/10/20 seconds with 20% jitter (rounded up); the
scheduler may run later. An unresolved executing action waits 150 seconds to
respect the existing stale-action policy. Existing bounded provider fallback
remains inside the same run; worker retries only occur when a retryable failure
escapes the handler. Deterministic model fallback replies do not schedule another
generation attempt.

Recovery rechecks current global/owner/channel enablement, customer verification,
confirmation expiry, task state and existing action allowlists. Internal order
RPCs still check authoritative price/stock and execution identity. The SQL wrapper
checks the current conversation and controls again at mutation time. Cached prose
confers no authority. Preview uses the same persistent budget and quota boundary,
with an isolated scope, no replay payload and no business mutation capability.

## Delivery and Telegram progress

Every customer send has an independent operation key and delivery row. The row
records channel/type, encrypted request routing/content, attempts, timestamps,
known platform message ID, sanitized failure and retry safety.

`pending -> sending -> delivered | retryable_failed | permanently_failed | unknown`

A known 429 can retry, up to four attempts. Known 4xx rejection can use the
existing formatting/card fallback. Network exceptions, malformed acknowledgements
and uncertain 5xx become `unknown` for message creation. Expired `sending` rows
receive the same conservative classification. Edits/deletions are safe to retry.
If replay encounters different request content/routing for an existing ordinal
key, it stops with `replay_unavailable` before another network send.

Neither channel integration has a reliable lookup by our internal delivery ID.
An unknown create stays visible in SQL for manual investigation. Re-sending it
requires a deliberate operator decision; no manual-resend endpoint is added here.
The system does not promise exactly-once Telegram/Instagram delivery.

Telegram uses one fixed progress-creation key. Its acknowledged message ID is
reused across fresh adapter instances, with server `RunProgressEvent.display_text`
as the only semantic source. Completion removes progress before the final answer.
A separate terminal-cleanup claim deletes known abandoned progress IDs, with a
30-second cleanup lease and four attempts. A crash on the fourth cleanup attempt
is marked failed by cleanup. Unacknowledged progress creation has no usable ID;
it cannot be reliably removed. No Telegram typing substitute is introduced.

## Usage, quota and privacy

Each paid runtime call first locks the business-limit row and atomically reserves
its conservative token allowance plus one message for `chat`. Admission includes
legacy measured usage and outstanding unknown/reserved calls. Missing limit data,
failed reservation or lost authoritative persistence fails closed. The same row
lock serializes reconciliation, preventing two concurrent runs from both passing
the last available allowance.

Provider input/output and cached-input measurements are stored when supplied.
Missing measurements remain null/unknown, never fabricated zeros. Reconciliation
adds a unique reservation-linked legacy usage row once; it is awaited. A timeout
or crash before reconciliation retains the conservative reservation for that
calendar month's admission checks. This can temporarily reject legitimate work
near quota until actual usage is manually established. No automatic release
assumes a timed-out request was free. The legacy dashboard reports measured usage;
it does not yet display outstanding reservations, so its remaining count can be
more optimistic than admission.

The billing unit remains successful chat completions, not inbound receipts;
intent calls consume tokens only. Embeddings are run-linked and measured
separately, excluded from legacy billed totals, while still subject to admission
checks. No price or subscription model changes are introduced.

Operational traces contain stage codes, attempts and provider/model/capability
identifiers, with a duration column reserved for future measured stages. They
cover receipt/claim, model and retrieval stages, tools, confirmation, action
preparation/mutation, generation, delivery, retries and completion. They do not
store prompts, customer messages or hidden reasoning. Trace stage timestamps
support elapsed-time inspection; not every stage supplies an explicit duration.

Replay envelopes and public answer checkpoints use the existing AES-256-GCM
server key. Active verification challenges, standalone code-like submissions,
secret-labelled text and token-bearing `/start` messages are omitted from the
queued text and run only from the immediate request. If interrupted, these events
require a new customer submission. Verification-processing failures do not fall
through to the AI as ordinary customer text.

Private answers are not cached as resumable runtime results. Encrypted outbound
request records can contain their delivered text until cleanup; existing inbox
and session retention policies continue separately. The ingestion classifier is
not a universal secret detector: arbitrary unsolicited secrets and a verification
challenge created after receipt cannot always be identified at receipt time.

Terminal events erase their inbound replay payload. Scheduled cleanup removes
remaining envelopes, answer checkpoints and ordinary delivery content after 30
minutes. Known progress routing is retained until deletion succeeds or its bounded
cleanup is exhausted. Deduplication tombstones, usage and safe trace metadata
remain; long-term metadata archival is future operational work. Physical cleanup
depends on the scheduler running.

## Stable failure categories

The exported vocabulary is:

```text
provider_timeout          provider_rate_limit     provider_unavailable
malformed_model_output    retrieval_unavailable   authorization_denied
action_validation_failed  database_unavailable    lease_conflict
delivery_failed           delivery_unknown        budget_exhausted
deadline_exceeded         quota_exceeded          retry_exhausted
late_event                replay_unavailable      action_unresolved
internal_failure
```

Retryable worker categories: provider timeout/rate limit/unavailability,
retrieval unavailability, database unavailability, known delivery failure and
unresolved action. All other categories terminate or leave delivery unresolved.
Some vocabulary entries, notably `malformed_model_output`, reserve a stable name
for later instrumentation: existing planner validation can still resolve through
its deterministic fallback rather than emitting that category. Quota RPC errors
currently aggregate exhausted and unavailable quota under `quota_exceeded`.

## Automated validation and regression evidence

Validated locally on 2026-09-11:

| Command | Result |
| --- | --- |
| `npm run test:ai-harness-phase-3` | Pass: real worker/runtime/provider/delivery modules with mocked platforms/provider and local PostgreSQL |
| `npm run test:ai-processing-sql` | Pass: migration rerun, receipt uniqueness, ordering, lease fencing, budget reset rejection, CAS replay, quota contention/reconciliation and role denial |
| `npm run test:ai-runtime-sql` | Pass: Phase 2 schema applied twice, CAS/task lifecycle and role denial |
| `npm run test:ai-harness-phase-2` | Pass: runtime/channel regression scenarios |
| `npm run test:ai-harness-phase-1` | Pass: privacy, controls and provider fallback |
| `npm run test:ai-actions` | Pass: action engine, confirmation, authorization, idempotency and connector boundaries |
| `npm run test:ai-actions-internal` | Pass: internal action/schema source assertions |
| `npm run test:business-data-ai` | Pass: 10 evaluations |
| `npm run test:business-data-private` | Pass: 14 protected cases |
| `npx tsc --noEmit` | Pass |
| `npm run lint` | 0 errors; 39 pre-existing warnings |
| `npm run build -- --webpack` | Pass: production compilation, type checks and route generation |

Phase 3 covers duplicate Telegram/Instagram events, crash after generation,
crash before/after an idempotent mutation, restored budgets after timeouts,
known 429 retry, ambiguous sends, changed delivery content, progress reuse and
terminal cleanup, ordered quantity correction, late arrival during recovery,
expired confirmation, revoked channel, trace hierarchy and journaled memory/inbox.
The mutation crash test executes the production fencing wrapper against a small
idempotent business-write fixture; it does not exercise a real hosted order or
external connector. Existing internal-action tests include static assertions.
These are deterministic local checks, not live platform acceptance results.

Tests use external PGlite 0.5.8, with no production dependency change:

```bash
npm install --prefix /private/tmp/pushtiban-phase2-sql --no-audit --no-fund @electric-sql/pglite@0.5.8
npm run test:ai-harness-phase-3
npm run test:ai-processing-sql
```

`PGLITE_MODULE` can point to another installed PGlite module. PostgreSQL runs in
process for tests only; production persistence remains Supabase.

| Scenario | Calls / token evidence |
| --- | --- |
| Normal product lookup | 2 model calls, matching Phase 2; no persistence-related call |
| Normal nine-turn order regression, Telegram/Instagram | 1 planner call per turn, no answer call; confirmation uses 0 model calls |
| Known failed delivery then successful retry | 0 additional model calls after the generated reply |
| Interrupted/timeout generation | May use remaining model attempts, never resets original counters or deadline |
| Phase 3 mocked product usage | 240 input / 60 output tokens across 2 calls |
| Phase 2 fixture usage | 100 input / 20 output per order turn; fixture values, not an actual tokenizer measurement |

The Phase 2 product prompt regression remains 4,504 bytes (its Phase 1 comparison
is 4,240 bytes). Phase 3 adds no prompt text. Mocked token values from different
fixtures are not comparable production cost estimates. Actual pricing/cached
tokens require provider usage and deployed measurements.

Representative local RPC timings from the Phase 3 fixture:

| Operation | Mean | Maximum |
| --- | ---: | ---: |
| Receipt | 0.52 ms | 3.37 ms |
| Claim | 0.38 ms | 2.10 ms |
| Run/checkpoint update | 0.24 ms | 0.94 ms |
| Delivery begin | 0.32 ms | 0.64 ms |
| Delivery finish | 0.31 ms | 0.57 ms |
| Quota reserve / reconcile | 0.43 / 0.23 ms | 1.54 / 0.48 ms |

The fixture made 72 run/checkpoint updates across its scenarios. The cost is
additional database work and round trips. These in-process figures exclude
Supabase network latency, TLS, contention and cold starts, and must not be read as
hosted end-to-end overhead. Production-region latency remains unmeasured.
The fixture's logical row sizes totaled 3,540 bytes for 17 events, 13,221 for 17
runs, 11,309 for 119 traces and 1,676 for 7 deliveries. This is approximately
30 KB, excluding indexes, WAL, usage tables, TOAST and update bloat.

## Deployment and exact manual acceptance

No Phase 3 production SQL, environment change, scheduler, push or merge has been
performed. Before live testing, manually run **`supabase/ai-processing.sql`** in
the intended Supabase SQL Editor. It is idempotent and transactional. Existing
`admin.sql`, `ai-actions.sql`, `ai-runtime.sql`, channel-session, inbox and private
Business Data schemas must already be installed. No other SQL file changes in
this phase. Confirm the test business has an `ai_business_limits` row.

Keep the existing server encryption key. Configure a server-only `CRON_SECRET`
and schedule authenticated GET requests to `/api/internal/ai-recovery`. The
endpoint rejects absent or incorrect credentials. One invocation cleans one
terminal progress message, performs retention cleanup, scans at most 30 due
events, and processes at most one claimed event. A minute cadence gives roughly
one queued recovery per minute per invocation; it is not a high-throughput worker.
The scheduler must support the requested cadence and route duration. No schedule
is installed by this branch. A preview deployment or local channel test tunnel
must use the Phase 3 branch; production `main` cannot test these changes yet.

Use a dedicated test business and disposable orders. Do not simulate crash/fault
cases by altering live customer events. Run these acceptance checks before merge:

1. Apply the SQL and verify service-only access. Run the local suites above.
   Check the recovery URL returns 401 without its header and 200 with it.
2. Send a greeting and a public product question to Telegram and Instagram.
   Expect one canonical run per platform event, one final response (or the normal
   product cards), and no lingering known Telegram progress message.
3. Ask for an order, supply its fields, then confirm. Expect one order/execution
   reference and the correct stock change. Repeat the same signed webhook event
   from a test platform fixture; expect the same receipt/run and no extra order,
   TaskDraft revision or acknowledged response. A new customer message is a new
   event, not a duplicate-delivery test.
4. Send quantity 2 then immediately correct it to 1 before confirmation. Inspect
   the latest draft and confirmation; they must show quantity 1. Repeat on both
   channels. Instagram follows database receipt order if network arrivals differ.
5. Start a test event, terminate the local server after claim, then restart it.
   After 150 seconds call recovery. Expect the same run ID and nondecreasing
   counters. A saved answer can be delivered; unfinished generation must honor
   the expired deadline. For exact crash-at-mutation and transport fault points,
   run the deterministic Phase 3 suite; it contains controllable fault fixtures.
6. Exercise the fixture's before/after-mutation crash cases and verify one
   mutation. On a test channel, disable the assistant while a retry is pending;
   verify no new mutation. Let a pending confirmation expire and verify it cannot
   execute. Re-enable the test controls afterward.
7. Run the known 429 and unknown-send fixtures. Inspect that 429 retries delivery
   without generation, while unknown acceptance stays unresolved with one send
   attempt. Never reset an unknown delivery to pending as an acceptance shortcut.
8. Run the progress-interruption fixture. On Telegram, interrupt a request after
   seeing its progress message, then invoke recovery/terminal cleanup; a known ID
   should be reused or removed. Review `cleanup_state` if deletion cannot succeed.
9. Run the quota-contention fixture with two events near a limit. Inspect measured
   and unknown reservations. Verify preview is also blocked when no reservation
   can be made, and cannot create a business order.
10. Test private lookup/verification with disposable credentials. Confirm no
    verification submission appears in replay text or operational traces and
    that interrupted verification requires a fresh submission. Do not export or
    print production encrypted payloads while reviewing metadata.
11. Trigger recovery after test data exceeds 30 minutes; confirm replay payloads
    and checkpoints are removed while event/run/delivery metadata remains. Check
    scheduler logs and elapsed time under the intended deployment region.

Metadata-only SQL for inspection (filter further by the test business ID):

```sql
select e.id as event_id, e.external_id, e.channel, e.state, e.attempts,
       e.lease_until, e.available_at, e.failure_category,
       r.id as run_id, r.stage, r.outcome, r.task_revision,
       r.action_execution_id, r.runtime->'counts' as counts
from public.ai_inbound_events e
join public.ai_processing_runs r on r.inbound_event_id = e.id
order by e.receipt_sequence desc limit 30;

select d.run_id, d.operation_key, d.channel, d.state, d.attempts,
       d.platform_message_id, d.failure_category, d.cleanup_state
from public.ai_outbound_deliveries d order by d.created_at desc limit 50;

select run_id, code, attempt, provider, model, capability, failure_category,
       created_at from public.ai_run_events order by id desc limit 100;

select run_id, kind, provider, model, state, reserved_tokens,
       prompt_tokens, cached_input_tokens, completion_tokens
from public.ai_usage_reservations order by created_at desc limit 50;
```

## Remaining limits and follow-ups

- Safety is stronger than availability: expired AI work, unreplayable verification
  and ambiguous delivery can end without the original answer. They remain
  inspectable; there is no automatic assumption of success.
- Delivery identity depends on deterministic operation ordering. Changed menus,
  recipients or regenerated signed image URLs can require manual handling when
  the request comparison fails. The guard prevents sending mismatched content.
- Existing administrative Telegram reply/link workflows retain their own state
  machines; this phase does not claim transactional journaling for every legacy
  administrative operation. Customer AI actions, TaskDraft, memory, inbox creation
  and platform send boundaries are the covered durability surface.
- External connector writes cannot share a local Postgres transaction. They
  retain current checks and execution references; duplicate prevention depends on
  the existing destination idempotency contract. Local fencing alone cannot stop
  a network request already accepted by an external service.
- Recovery cadence, one-event invocation throughput, retention maintenance and
  hosted database round trips need observation before increasing traffic. A full
  operational dashboard, manual reconciliation tooling, archival and explicit
  stage-duration instrumentation are follow-ups, not shipped UI.
- Grounding/retrieval quality and other Phase 4 work remain out of scope. There
  has been no live Telegram/Instagram or production-schema verification of Phase 3.
