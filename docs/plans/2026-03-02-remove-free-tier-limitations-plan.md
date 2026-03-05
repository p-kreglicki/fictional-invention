# Config-driven Mistral embedding throttling (revised)

## Summary

Replace the hard-coded free-tier pacing in the embedding pipeline with an environment-driven configuration so the application no longer assumes Mistral Free Tier limits. The scope remains intentionally limited to the current embeddings path used by content ingestion. No API routes, database schema, or exercise-generation code are changed in this plan.

This revision closes the gaps identified in review:

- the env validation explicitly allows `0`
- the test strategy now specifies the exact Vitest module-isolation pattern
- logging behavior is explicit when throttling is disabled
- documentation updates name the concrete repo files that currently reference the 31-second/free-tier assumption

## Goals

- Remove the embedded assumption that Mistral is limited to `2 req/min`.
- Preserve batching behavior for embeddings.
- Make throttling configurable without requiring code changes per environment.
- Keep the change minimal and localized to the current code path.
- Preserve the existing public function signatures.

## Out of scope

- Adding chat completion support
- Adding provider-wide concurrency control
- Changing request/response contracts for any API route
- Refactoring content ingestion beyond its current dependency on `createEmbeddingsBatched`
- Implementing the exercise-generation endpoint
- Editing local untracked environment files like `.env.local` as part of the code change

## Current repo facts that shape this plan

- The current hard-coded delay exists only in [Mistral.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/Mistral.ts:120).
- The only in-repo caller of `createEmbeddingsBatched()` is [ContentIngestion.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/ContentIngestion.ts:254).
- The repo does not contain `.env.example` or `.env.local.example`; it currently has `.env`, `.env.local`, and `.env.production`.
- Existing repo files that explicitly reference the fixed `31s` / free-tier assumption include:
  - [Mistral.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/Mistral.ts:56)
  - [docs/plans/2026-03-01-feat-phase2-content-ingestion-pipeline-plan.md](/Users/piotrkreglicki/Projects/exercise-maker/docs/plans/2026-03-01-feat-phase2-content-ingestion-pipeline-plan.md:55)
  - [docs/plans/2026-03-02-feat-exercise-generation-api-plan.md](/Users/piotrkreglicki/Projects/exercise-maker/docs/plans/2026-03-02-feat-exercise-generation-api-plan.md:542)
  - [todos/014-complete-p2-31s-rate-limit-delay.md](/Users/piotrkreglicki/Projects/exercise-maker/todos/014-complete-p2-31s-rate-limit-delay.md:25)
  - [italian-learning-tool-mvp-plan.md](/Users/piotrkreglicki/Projects/exercise-maker/italian-learning-tool-mvp-plan.md:140)

## Implementation changes

### 1. Add explicit embedding throttle config in environment validation

Update [Env.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/Env.ts) to add one new server-side environment variable:

- `MISTRAL_EMBEDDING_BATCH_DELAY_MS`
  - type: coerced integer
  - constraints: integer, `>= 0`
  - optional
  - semantic meaning: delay in milliseconds between embedding batches inside `createEmbeddingsBatched()`

The exact schema must be:

```ts
MISTRAL_EMBEDDING_BATCH_DELAY_MS: z.coerce.number().int().nonnegative().optional(),
```

Validation rules:

- unset means “no artificial delay”
- `0` means “no artificial delay”
- positive integers enable throttling
- negative values fail env validation
- no fallback to `31000`

`runtimeEnv` must be updated to include:

```ts
MISTRAL_EMBEDDING_BATCH_DELAY_MS: process.env.MISTRAL_EMBEDDING_BATCH_DELAY_MS,
```

### 2. Replace the hard-coded sleep in the batching helper

Update [Mistral.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/Mistral.ts) to remove the fixed free-tier wait from `createEmbeddingsBatched()`.

Current behavior to replace:

- the function always waits `31000ms` between batches when more batches remain

New behavior:

- read `const batchDelayMs = Env.MISTRAL_EMBEDDING_BATCH_DELAY_MS ?? 0`
- only sleep if:
  - there is another batch remaining, and
  - `batchDelayMs > 0`

Implementation details:

- keep the public function signature unchanged:
  - `createEmbeddingsBatched(texts: string[], onProgress?: (completed: number, total: number) => void): Promise<number[][]>`
- keep `MAX_BATCH_SIZE` unchanged
- keep `onProgress` behavior unchanged
- sleep only between batches, never after the final batch
- use a small internal helper in the same file if helpful:
  - `async function wait(ms: number)`

### 3. Logging behavior must be explicit and asymmetric

Logging should change as follows:

- when `batchDelayMs > 0`, emit the existing per-batch debug log in config-neutral form before sleeping, for example:
  - message: `Embedding batch throttling enabled`
  - structured fields: `{ batchDelayMs, remainingBatches }` or minimally `{ batchDelayMs }`
- when `batchDelayMs === 0`, emit no per-batch log at all

Do not add a startup-time “throttling disabled” log. The default unthrottled path should be silent to avoid noisy logs in the common case.

This replaces the current free-tier-specific message in [Mistral.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/Mistral.ts:122).

### 4. Keep callers unchanged

No interface or call-site changes are required in [ContentIngestion.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/ContentIngestion.ts).

Expected effect on the current caller:

- ingestion still batches embeddings exactly as today
- ingestion becomes faster by default because the delay is no longer implicit
- environments that still want pacing can opt in via `MISTRAL_EMBEDDING_BATCH_DELAY_MS`

### 5. Add focused unit tests with an exact isolation strategy

Create a new test file:

- [Mistral.test.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/Mistral.test.ts)

Test scope:

- cover `createEmbeddingsBatched()` only
- do not change production function signatures for testability
- use module reset plus dynamic import; do not inject delay as a function parameter

The exact test-isolation approach must be:

1. snapshot the original `process.env` in `beforeEach`
2. set or unset `process.env.MISTRAL_EMBEDDING_BATCH_DELAY_MS` for the test case
3. call `vi.resetModules()`
4. dynamically import `@/libs/Mistral` after env setup so `Env` is rebuilt with the test’s values
5. restore `process.env` in `afterEach`
6. use fake timers only in tests that verify waiting behavior

Recommended structure:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

afterEach(() => {
  process.env = originalEnv;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function loadMistralModule() {
  return import('@/libs/Mistral');
}
```

Implementation notes:

- mock the underlying Mistral embeddings call or spy on `createEmbeddings` behavior through module-level stubbing after import, depending on the simplest stable approach in Vitest
- prefer stubbing the client interaction boundary, not the delay helper, so the test still validates the actual control flow
- use `vi.useFakeTimers()` and `await vi.advanceTimersByTimeAsync(...)` when asserting a configured delay
- do not rely on real-time elapsed duration assertions

Required test cases:

1. `returns embeddings without waiting when delay is unset`
2. `returns embeddings without waiting when delay is 0`
3. `waits between batches when delay is configured`
4. `skips wait after the final batch`
5. `preserves progress callbacks across batches`

### 6. Update inline comments and concrete documentation references

Update comments in [Mistral.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/Mistral.ts):

- remove wording that says the code enforces free-tier limits
- replace it with wording that explains batching is supported and optional throttling is environment-controlled

Update only the concrete repo docs that currently mention the fixed 31-second embedding delay as current behavior, not every historic planning artifact indiscriminately.

In scope for documentation refresh:

- [docs/plans/2026-03-01-feat-phase2-content-ingestion-pipeline-plan.md](/Users/piotrkreglicki/Projects/exercise-maker/docs/plans/2026-03-01-feat-phase2-content-ingestion-pipeline-plan.md:55)
  - update statements that present `31 seconds between batches` as the active implementation
- [docs/plans/2026-03-02-feat-exercise-generation-api-plan.md](/Users/piotrkreglicki/Projects/exercise-maker/docs/plans/2026-03-02-feat-exercise-generation-api-plan.md:542)
  - update references that assume current Mistral calls are constrained by the enforced 31-second delay
- [todos/014-complete-p2-31s-rate-limit-delay.md](/Users/piotrkreglicki/Projects/exercise-maker/todos/014-complete-p2-31s-rate-limit-delay.md:25)
  - annotate or revise to reflect that the fixed delay is being replaced by config-driven throttling

Out of scope for mandatory update:

- older historical/product planning references like [italian-learning-tool-mvp-plan.md](/Users/piotrkreglicki/Projects/exercise-maker/italian-learning-tool-mvp-plan.md:140) may mention free tiers in broader context; only update them if they incorrectly describe current code behavior, not if they are simply historical rationale

### 7. Environment file discoverability

Because the repo does not contain committed example env files, do not add `.env.example` updates as part of this change unless the team explicitly wants to introduce committed examples.

Instead:

- document the new variable in the relevant plan/doc file(s)
- if the project later adds a committed example env file, include `MISTRAL_EMBEDDING_BATCH_DELAY_MS` there at that time

This avoids mutating developer-local env files and keeps the current scope minimal.

## Public APIs, interfaces, and types

### Unchanged public function interfaces

These remain unchanged:

- `createEmbeddings(texts: string[]): Promise<EmbeddingResult>`
- `createEmbeddingsBatched(texts: string[], onProgress?: (completed: number, total: number) => void): Promise<number[][]>`

No HTTP API contracts change.

No database types or schemas change.

### Added configuration surface

New environment variable in [Env.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/Env.ts):

- `MISTRAL_EMBEDDING_BATCH_DELAY_MS?: number`

This is the only new externally configurable interface in scope.

## Acceptance criteria

- The code no longer contains a hard-coded `31000ms` inter-batch sleep.
- `Env.ts` validates `MISTRAL_EMBEDDING_BATCH_DELAY_MS` with `.int().nonnegative().optional()`.
- `createEmbeddingsBatched()` runs without artificial delay when `MISTRAL_EMBEDDING_BATCH_DELAY_MS` is unset.
- `createEmbeddingsBatched()` runs without artificial delay when `MISTRAL_EMBEDDING_BATCH_DELAY_MS=0`.
- `createEmbeddingsBatched()` respects the configured delay when `MISTRAL_EMBEDDING_BATCH_DELAY_MS` is a positive integer.
- Existing batching, progress callback behavior, and caller contracts remain unchanged.
- Unthrottled execution produces no new per-batch logs.
- Unit tests cover throttled and unthrottled paths using module-reset-based env isolation.

## Risks and mitigations

### Risk: faster ingestion may hit real provider limits in some environments

Mitigation:

- make throttling explicitly configurable
- operators can set `MISTRAL_EMBEDDING_BATCH_DELAY_MS` where needed without code changes

### Risk: env-based behavior is harder to test because `Env` is built at import time

Mitigation:

- use `vi.resetModules()` and dynamic import after setting `process.env` in each test case
- keep the production interface unchanged rather than introducing test-only parameters

### Risk: developers may assume “no delay” means unlimited throughput

Mitigation:

- document that this change removes the code’s conservative pacing, not the provider’s actual account limits
- keep batching logic intact to avoid uncontrolled fan-out

### Risk: documentation drift if only code is updated

Mitigation:

- update the specific plan/todo files that currently describe the 31-second delay as active behavior
- avoid broad historical doc rewrites that dilute the change scope

## Test cases and scenarios

### Unit

- `returns embeddings without waiting when delay is unset`
- `returns embeddings without waiting when delay is 0`
- `waits between batches when delay is configured`
- `skips wait after the final batch`
- `preserves progress callbacks across batches`

### Regression

- single-batch embedding input does not sleep
- multi-batch embedding input still preserves output ordering
- existing ingestion flow can continue calling `createEmbeddingsBatched()` without code changes

## Rollout notes

- Deploy with `MISTRAL_EMBEDDING_BATCH_DELAY_MS` unset to remove the free-tier-specific delay immediately.
- If the upgraded Mistral account still needs some pacing, set a smaller environment-specific delay value without changing code.
- Monitor ingestion latency and provider errors after rollout to validate the new default.

## Assumptions and defaults

- Default selected scope: embeddings only.
- Default runtime behavior: no artificial inter-batch delay.
- Default logging behavior when unthrottled: no per-batch log.
- `MAX_BATCH_SIZE` remains `16`; this plan does not change batching size.
- No provider-wide concurrency layer is introduced in this phase.
- Existing content-ingestion flow remains the only in-repo caller of `createEmbeddingsBatched()`.