---
title: "feat: Phase 4 Answer Evaluation"
type: feat
date: 2026-03-05
status: ready
parent: docs/plans/2026-02-28-feat-italian-rag-learning-tool-plan.md
---

# Phase 4: Answer Evaluation

## Overview

Build the answer-submission and evaluation flow for generated exercises so authenticated users can submit answers, receive actionable feedback, and persist results for later review.

**Goal:** Evaluate exercise answers with a consistent rubric, store response history, and update exercise performance stats without breaking the existing Phase 3 generation flow.

**Estimated effort:** 2-3 days

## Enhancement Summary

**Deepened on:** 2026-03-05  
**Sections enhanced:** 9  
**Research inputs used:** `architecture-strategist`, `security-sentinel`, `performance-oracle`, `julik-frontend-races-reviewer`, `data-integrity-guardian`, `spec-flow-analyzer`, `kieran-typescript-reviewer`, `code-simplicity-reviewer`, `docs/solutions/integration-issues/exercise-generation-hardening-pr23-system-20260305.md`, official Next.js, Drizzle ORM, and Zod documentation.

### Key improvements

1. Added read-model hardening so the dashboard no longer leaks correct answers before submission.
2. Strengthened persistence with composite idempotency, explicit indexes, and transaction guidance grounded in Drizzle patterns.
3. Added per-exercise submission state and retry/race handling so answer submission does not regress into duplicate writes or janky UI.

### New considerations discovered

- The current exercise cards reveal `correctIndex`, fill-gap answers, and sample answers directly, so Phase 4 must sanitize exercise payloads before exposing them to learners.
- `clientSubmissionId` should be scoped per user, not globally unique, and should be backed by explicit duplicate-request behavior tests.
- The dashboard needs per-card state rather than a single boolean, otherwise simultaneous submissions and reloads will feel brittle.

---

## Research Summary

### Key findings

| Area | Finding | Impact |
|------|---------|--------|
| Existing schema | `responses`, `times_attempted`, and `average_score` already exist in `src/models/Schema.ts:120-135` | Phase 4 can ship with minimal schema expansion |
| Route pattern | Generation route already standardizes auth, JSON parsing, rate-limit headers, and explicit error mapping in `src/app/[locale]/api/exercises/generate/route.ts:45-148` | Evaluation route should match the same transport contract |
| LLM integration | Structured and JSON Mistral helpers already exist in `src/libs/Mistral.ts:168-223` | Reuse current chat client instead of introducing a second evaluation client |
| Dashboard bootstrap | The exercises dashboard already bootstraps documents and exercises, then merges async results in `src/components/exercises/ExercisesDashboard.tsx:74-258` | Evaluation UX should extend the same page instead of adding a parallel screen |
| Validation patterns | Exercise generation uses Zod discriminated unions and explicit source-reference constraints in `src/validations/ExerciseValidation.ts:8-95` | Phase 4 should use the same validation style for evaluation payloads and model output |
| Exercise read model | `src/components/exercises/ExerciseCards.tsx:17-123` currently renders answer-bearing fields directly from `exerciseData` | Phase 4 must split learner-facing exercise DTOs from evaluator-only answer keys |

### Institutional learnings

From `docs/solutions/integration-issues/exercise-generation-hardening-pr23-system-20260305.md`:

1. Malformed JSON must be treated as a request-validation problem and return `422`, not `500`.
2. Client polling or submission loops must guard against overlap to avoid duplicate work.
3. New endpoints should classify user-correctable failures as `4xx` and reserve `5xx` for internal failures.

### External research decision

Targeted external research completed. The codebase already provided most of the shape, so only framework-specific documentation was added where it materially tightened the plan.

### Targeted documentation findings

1. Next.js App Router route handlers use `request.json()` for POST bodies, and the request body can only be consumed once unless cloned first. That reinforces the existing malformed-JSON guard pattern and argues for a single parse/validate step at the route boundary.
   - Reference: [Next.js route handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
2. Drizzle’s `db.transaction(...)`, `.returning()`, and aggregate helpers (`count`, `avg`) fit the planned “insert response + recompute stats + return normalized payload” flow cleanly.
   - References: [Drizzle transactions](https://orm.drizzle.team/docs/transactions), [Drizzle insert](https://orm.drizzle.team/docs/insert), [Drizzle select](https://orm.drizzle.team/docs/select)
3. Zod’s `safeParse`, `discriminatedUnion`, and `superRefine` support the request-contract and duplicate/shape validation patterns already used elsewhere in the repo.
   - Reference: [Zod API](https://zod.dev/api)

---

## Technical Approach

### Architecture

```text
Exercise card submit
  -> POST /api/responses/submit
      -> requireUser + rate limit + JSON parsing
      -> load owned exercise
      -> type-specific evaluator
          -> deterministic evaluator (multiple choice)
          -> normalized matcher with LLM fallback (fill gap)
          -> structured LLM rubric (single answer)
      -> transaction
          -> insert response row
          -> recompute exercise stats
      -> return evaluation payload
  -> dashboard updates local exercise state
  -> GET /api/exercises bootstrap includes latest response summaries
```

### Key design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Execution model | Synchronous request/response | One answer maps to one evaluation, so immediate feedback is simpler than introducing a second async job system |
| Evaluation strategy | Hybrid by exercise type | Deterministic evaluation avoids unnecessary LLM cost for objective questions, while open-ended answers still get nuanced feedback |
| Determinism target | Objective types deterministic; LLM types use temperature `0` or `0.1` | Supports the parent plan requirement that the same answer should score consistently |
| Duplicate-submit protection | Add `clientSubmissionId` to request contract and persist it uniquely on `responses` | Prevents double-clicks, retries, or overlapping requests from inflating stats |
| Stats updates | Insert response and recompute `timesAttempted`/`averageScore` in one transaction | Avoids drift between response history and exercise aggregates |
| Dashboard parity | Extend existing exercises payload with latest response summary | Preserves reload resilience without adding a second bootstrap endpoint |
| Read-model safety | Return a sanitized exercise DTO to the client and load full answer keys only on the server | Prevents the UI from becoming self-answering |

### Research insights

**Best practices:**

- Keep the route boundary thin: parse JSON once, validate once, and hand a typed payload to a dedicated evaluation service.
- Keep answer keys server-side. The submit route should always load the exercise from the database and never trust client-submitted grading data.
- Use one normalized evaluation result shape for all exercise types, even when the scoring backend differs.

**Performance considerations:**

- Deterministic branches should bypass LLM calls entirely so objective answers stay fast and cheap.
- Bootstrap queries should fetch only the latest response summary per exercise, not full response history.
- Add explicit indexes for the new read and idempotency paths instead of assuming foreign keys cover them.

**Implementation details:**

- Preserve the existing `runtime = 'nodejs'` route pattern.
- Prefer a separate `AnswerEvaluation.ts` module over extending `ExerciseGeneration.ts`; the domains are adjacent but operationally different.
- Model duplicate submission handling at the persistence layer, not only via client-side button disabling.

**Edge cases:**

- Two browser tabs submit the same answer simultaneously.
- A mobile retry replays the same `clientSubmissionId` after the first request succeeded but the response never arrived.
- A fill-gap answer differs only by apostrophe style (`'` vs `’`) or Unicode normalization.

### Evaluation policy by exercise type

#### Multiple choice

- Compare submitted option index against `exerciseData.correctIndex`
- Return deterministic score
- Reuse stored explanation when present
- Store rubric in the same schema shape as other evaluators for downstream UI consistency

#### Fill in the gap

- Normalize whitespace, punctuation, and Italian casing/diacritics before comparison
- Accept exact match against `answer` or any `acceptedAnswers`
- If normalized comparison fails but the answer is short and plausible, call Mistral for nuanced grammar and accuracy feedback
- This keeps common answers fast while still handling near-miss learner input

#### Single answer

- Always evaluate through Mistral structured output
- Include question, sample answer, grading criteria, and user answer
- Ask for rubric category scores, overall feedback, and suggested review topics
- Keep prompt temperature at the lowest acceptable deterministic setting and cap prompt content to the minimum fields needed for evaluation

---

## Data Contracts

### Database changes

#### Required

- Add `clientSubmissionId` to `responsesSchema` in `src/models/Schema.ts`
  - Type: `uuid`
  - Constraint: not null
- Add composite unique index on `(user_id, client_submission_id)`
- Add index supporting latest-response lookup on `(exercise_id, user_id, created_at desc)`

#### Existing fields reused

- `responses.answer`
- `responses.score`
- `responses.rubric`
- `responses.overallFeedback`
- `responses.suggestedReview`
- `responses.responseTimeMs`
- `exercises.timesAttempted`
- `exercises.averageScore`

### New validation module

**File:** `src/validations/ResponseValidation.ts`

Define:

1. `SubmitResponseRequestSchema`
   - `exerciseId: uuid`
   - `answer: string | number`
   - `responseTimeMs?: int >= 0`
   - `clientSubmissionId: uuid`

2. `EvaluationRubricSchema`
   - `accuracy: int 0..40`
   - `grammar: int 0..30`
   - `fluency: int 0..20`
   - `bonus: int 0..10`

3. `EvaluationResultSchema`
   - `score: int 0..100`
   - `rubric: EvaluationRubricSchema`
   - `overallFeedback: string`
   - `suggestedReview: string[]`
   - `corrections?: string[]`
   - `evaluationMethod: 'deterministic' | 'llm'`

4. `ExerciseLatestResponseSchema`
   - payload used when bootstrapping `GET /api/exercises`

### Read-model hardening

Add a learner-facing DTO so `GET /api/exercises` stops exposing evaluator-only data:

1. `ExerciseCardSchema`
   - `id`
   - `type`
   - `difficulty`
   - `question`
   - `grammarFocus`
   - `createdAt`
   - `renderData`

2. `renderData` by type
   - `multiple_choice`: `options[]`
   - `fill_gap`: optional `hint`, no correct answer fields
   - `single_answer`: optional learner-visible rubric criteria, no sample answer

3. Server-only evaluator input
   - Load full `exerciseData` directly from the database inside `AnswerEvaluation.ts`
   - Never send `correctIndex`, `answer`, `acceptedAnswers`, or `sampleAnswer` to the client before evaluation

### Research insights

**Best practices:**

- Use `safeParse` at API boundaries and convert the result to the repo’s stable error envelope instead of letting schema failures throw.
- Use `superRefine` for cross-field checks such as duplicate or malformed accepted answers.
- Keep public DTOs and persistence models separate; the dashboard should not consume raw database JSON blindly.

**Performance considerations:**

- The “latest response per exercise” query should be batched, not implemented as one query per card.
- Explicit indexes matter here because Postgres does not automatically create every lookup pattern needed by foreign keys.

**Edge cases:**

- A duplicate `clientSubmissionId` with a different payload should be rejected clearly rather than replayed ambiguously.
- Old exercises created before the migration may have no `clientSubmissionId` on historical rows; the migration should scope the not-null requirement to new writes safely.

### API contract

**Route:** `POST /api/responses/submit`

Success response:

```json
{
  "response": {
    "id": "uuid",
    "exerciseId": "uuid",
    "score": 82,
    "rubric": {
      "accuracy": 32,
      "grammar": 24,
      "fluency": 18,
      "bonus": 8
    },
    "overallFeedback": "Good control of the passato prossimo, but article agreement needs work.",
    "suggestedReview": ["definite articles", "past participles"],
    "responseTimeMs": 18400,
    "createdAt": "2026-03-05T10:30:00.000Z"
  },
  "exerciseStats": {
    "timesAttempted": 3,
    "averageScore": 74
  }
}
```

Error codes:

- `INVALID_REQUEST`
- `UNAUTHORIZED`
- `USER_NOT_FOUND`
- `EXERCISE_NOT_FOUND`
- `RATE_LIMIT_EXCEEDED`
- `DUPLICATE_SUBMISSION`
- `EVALUATION_FAILED`
- `INTERNAL_ERROR`

---

## Implementation Phases

### Phase 4.1: Validation and schema foundation

**Goal:** Define request, response, and model-output contracts before route or UI work.

**Tasks:**

- [x] Create `src/validations/ResponseValidation.ts`
- [x] Add response payload types for dashboard consumption
- [x] Add `clientSubmissionId` to `src/models/Schema.ts`
- [x] Generate migration for the new column and unique index

**Acceptance Criteria:**

- [x] Request and evaluation payloads have strict Zod schemas
- [x] Duplicate submissions can be rejected or safely replayed by ID
- [x] TypeScript types align with database insert/select usage
- [x] Public exercise DTOs do not leak answer keys

---

### Phase 4.2: Evaluation service

**Goal:** Centralize evaluation rules behind one service instead of embedding scoring logic in the route.

**Files:**

- `src/libs/AnswerEvaluation.ts`
- `src/libs/AnswerEvaluationPrompts.ts`
- `src/libs/AnswerEvaluation.test.ts`

**Tasks:**

- [x] Create exercise loader that verifies ownership before evaluation
- [x] Implement deterministic evaluator for multiple-choice answers
- [x] Implement normalized fill-gap matcher with accepted-answer handling
- [x] Add LLM fallback for fill-gap near misses
- [x] Add structured LLM evaluator for single-answer exercises using `createStructuredChatCompletion`
- [x] Normalize all evaluator outputs into `EvaluationResultSchema`
- [x] Add logging for method, latency, and failures
- [x] Normalize learner answers with NFC, apostrophe normalization, whitespace collapse, and case folding before comparison where appropriate

**Prompt structure for LLM-backed evaluators:**

```text
<system>
You are an Italian language evaluator.
Score the answer with this rubric:
- Accuracy (0-40)
- Grammar (0-30)
- Fluency (0-20)
- Bonus (0-10)

Be strict, deterministic, and concise.
Return valid JSON only.
</system>

<exercise>
Type: {type}
Question: {question}
Reference answer: {expected_answer}
Grading criteria: {grading_criteria}
</exercise>

<user_answer>
{user_answer}
</user_answer>
```

**Acceptance Criteria:**

- [x] Objective answers produce deterministic scores without LLM calls
- [x] Single-answer evaluation returns structured rubric output
- [x] Fill-gap evaluation accepts normalized equivalent answers
- [x] The same input re-evaluates to the same score within expected tolerance
- [x] The evaluator never depends on client-supplied answer keys or score hints

### Research insights

**Best practices:**

- Prefer a strategy map keyed by exercise type over a long conditional chain once more than two type-specific branches exist.
- Keep prompt builders in a separate module so evaluator logic remains testable without parsing large strings.
- Treat “deterministic” and “llm” as evaluation methods in the persisted response metadata or logs so behavior is debuggable.

**Performance considerations:**

- Cache nothing prematurely; evaluation is write-heavy and per-user, so clarity beats a speculative cache layer.
- Keep fill-gap fallback thresholds explicit to avoid accidentally sending almost every typo to the LLM.

**Edge cases:**

- Empty answers
- Whitespace-only answers
- Multiple-choice answers outside allowed option range
- Single-answer submissions large enough to blow prompt budgets

---

### Phase 4.3: Submission route and persistence

**Goal:** Expose a protected submission endpoint that stores history and keeps exercise stats consistent.

**Files:**

- `src/app/[locale]/api/responses/submit/route.ts`
- `src/app/[locale]/api/responses/submit/route.test.ts`

**Tasks:**

- [x] Mirror auth and malformed-JSON handling from `api/exercises/generate`
- [x] Add Arcjet fixed-window rate limiting scoped by `userId`
- [x] Validate request with `SubmitResponseRequestSchema`
- [x] Call the evaluation service
- [x] Insert response row and recompute exercise aggregates in one Drizzle transaction
- [x] Return normalized response payload and updated exercise stats
- [x] Map duplicate `clientSubmissionId` to `409 DUPLICATE_SUBMISSION`
- [x] Catch unique-constraint conflicts and convert them into the chosen duplicate-submission response contract

**Transaction contract:**

1. Insert `responses` row
2. Query `count(*)` and `round(avg(score))` for the exercise
3. Update `exercises.timesAttempted` and `exercises.averageScore`
4. Return both the created response and updated aggregates

**Refinement:**

- Implement this with `db.transaction(async (tx) => ...)`.
- Use Drizzle aggregates instead of reading all scores into memory.
- Keep the duplicate-submission behavior explicit:
  - simplest path: return `409 DUPLICATE_SUBMISSION`
  - stricter idempotent path: re-read and return the existing response when the repeated request matches exactly
- Choose one behavior and pin it with route tests before implementation starts.

**Acceptance Criteria:**

- [x] Malformed JSON returns `422`
- [x] Missing or non-owned exercises return `404`
- [x] Duplicate submissions do not create a second row or increment exercise stats twice
- [x] Failed evaluation does not leave partial response rows or stale aggregates

### Research insights

**Best practices:**

- Keep the route thin and move branching logic out to the service layer.
- Preserve the project’s explicit `4xx` vs `5xx` error taxonomy.
- Parse the request body exactly once because Next.js request streams are single-consume by default.

**Security considerations:**

- Rate-limit by authenticated user ID.
- Never expose whether an exercise exists outside the current user scope.
- Keep error messages stable and non-sensitive; do not leak raw database or model-provider errors.

---

### Phase 4.4: Dashboard submission and feedback UX

**Goal:** Let users answer directly from the current exercises dashboard and see the latest evaluation without leaving the page.

**Files:**

- `src/components/exercises/ExercisesDashboard.tsx`
- `src/components/exercises/ExerciseCards.tsx`
- `src/components/exercises/ExerciseCards.test.tsx`
- `src/app/[locale]/api/exercises/route.ts`
- `src/app/[locale]/api/exercises/route.test.ts`
- `src/locales/en.json`
- `src/locales/fr.json`

**Tasks:**

- [x] Extend `GET /api/exercises` to return sanitized exercise DTOs plus latest response summaries per exercise
- [x] Add answer inputs for each exercise type
- [x] Generate a `clientSubmissionId` per submission on the client
- [x] Add a submission gate so repeated clicks do not send overlapping requests
- [x] Render score, rubric summary, and feedback inline after submission
- [x] Preserve latest evaluation state on page reload
- [x] Localize all new labels and error messages under `DashboardExercisesPage`
- [x] Replace any always-visible answer reveal with post-submission feedback rendering

**Acceptance Criteria:**

- [x] Users can answer multiple-choice, fill-gap, and single-answer exercises from the existing dashboard
- [x] Successful submission updates the relevant exercise card without a full page refresh
- [x] Reloading the page shows the latest stored evaluation summary
- [x] Submission buttons stay locked while a request is in flight
- [x] Pre-submission UI does not expose correct answers or sample answers

### Research insights

**Best practices:**

- Track submission state per exercise card, not globally, so one in-flight answer does not freeze the whole page.
- Use `.finally()` or equivalent completion cleanup so loading state clears on both success and failure.
- Keep the UX intentionally asymmetric:
  - before submission: prompt-only
  - after submission: score + rubric + feedback + optionally the reference answer

**Race-condition considerations:**

- Prevent double-clicks and tab-repeat submits from dispatching overlapping `fetch` calls for the same exercise.
- Guard against stale responses overwriting newer local state if a user submits again after a first failure.
- If the page unmounts during a request, ignore the late response rather than mutating detached state.

---

### Phase 4.5: Testing and observability

**Goal:** Cover the new evaluation path with regression tests and operational visibility.

**Files:**

- `src/libs/AnswerEvaluation.test.ts`
- `src/app/[locale]/api/responses/submit/route.test.ts`
- `src/components/exercises/ExerciseCards.test.tsx`
- `src/libs/Env.ts`

**Tasks:**

- [x] Add unit tests for deterministic and LLM-backed evaluators
- [x] Add route tests for malformed JSON, auth failures, ownership failures, duplicate submissions, and evaluator failures
- [x] Add component tests for input rendering, in-flight locking, and inline feedback rendering
- [x] Add environment config for response rate limits in `src/libs/Env.ts`
- [x] Emit structured logs: `answer_evaluation_started`, `answer_evaluation_completed`, `answer_evaluation_failed`
- [x] Add regression coverage for sanitized exercise DTOs so answer keys never leak through list endpoints

**Acceptance Criteria:**

- [x] Route, service, and UI tests cover the main happy path and critical failure paths
- [x] Rate-limit settings are validated through `Env.ts`
- [x] Logs are sufficient to distinguish deterministic, fallback, and LLM evaluation flows

---

## System-Wide Impact

### Interaction graph

1. `ExerciseCards` collects input and submits to `POST /api/responses/submit`.
2. The route authenticates with `requireUser`, rate-limits, parses JSON, and validates the request.
3. `AnswerEvaluation.ts` loads the exercise, chooses a type-specific evaluator, and may call `createStructuredChatCompletion`.
4. The route transaction inserts into `responses`, recomputes aggregates on `exercises`, and returns the normalized payload.
5. `ExercisesDashboard` merges the updated response summary into local state; `GET /api/exercises` later rehydrates the same data after reload using sanitized exercise DTOs.

### Error and failure propagation

- Transport failures:
  - Malformed JSON -> `422 INVALID_REQUEST`
  - Zod validation failure -> `422 INVALID_REQUEST`
  - Rate limit exceeded -> `429 RATE_LIMIT_EXCEEDED`
- Ownership/auth failures:
  - Unauthenticated -> `401 UNAUTHORIZED`
  - Missing user sync -> `403 USER_NOT_FOUND`
  - Missing or non-owned exercise -> `404 EXERCISE_NOT_FOUND`
- Evaluation failures:
  - Duplicate submission key -> `409 DUPLICATE_SUBMISSION`
  - Mistral parse or scoring failure -> `422 EVALUATION_FAILED` when recoverable, otherwise `500 INTERNAL_ERROR`

### State lifecycle risks

| Risk | Why it matters | Mitigation |
|------|----------------|------------|
| Duplicate submissions | Can create duplicate `responses` rows and corrupt aggregate stats | Unique `clientSubmissionId` plus client-side submit lock |
| Partial persistence | Response insert could succeed while stats update fails | Wrap insert and aggregate recompute in one transaction |
| LLM variance | The same answer could score differently across calls | Deterministic branches for objective types and low-temperature structured output for open answers |
| Reload inconsistency | User could submit an answer, refresh, and lose visible feedback | Extend `GET /api/exercises` with latest response summaries |
| Schema drift | Generated exercise payloads may not match evaluator assumptions | Parse exercise data by type and fail fast with typed validation |
| Answer leakage | Learners can see answers before submitting if raw `exerciseData` is returned | Introduce sanitized DTOs and keep answer keys server-side |

### API surface parity

- New route: `POST /api/responses/submit`
- Updated route: `GET /api/exercises` adds latest-response summaries and switches to sanitized exercise DTOs
- Existing generation endpoints remain unchanged
- Shared auth/rate-limit/error-shape conventions stay aligned with `api/exercises/generate`

### Integration test scenarios

1. Submit a correct multiple-choice answer and verify:
   - deterministic score returned
   - response row persisted
   - `timesAttempted` and `averageScore` updated
2. Submit the same request twice with the same `clientSubmissionId` and verify:
   - one response row exists
   - stats increment once
   - second request returns duplicate-submission status
3. Submit a fill-gap near miss that requires LLM fallback and verify:
   - fallback path is used
   - structured feedback renders
   - payload remains schema-valid
4. Fetch exercises before any submission and verify:
   - answer keys are absent from the API payload
   - options or hints required for rendering are still present
5. Submit a single-answer response, reload the dashboard, and verify:
   - latest feedback appears from bootstrap data
   - no client-only state is required
6. Send malformed JSON to the submit route and verify:
   - `422` response
   - no evaluator call
   - no database writes

---

## Dependencies and risks

### Dependencies

- Phase 3 exercise generation must already be present and stable
- `src/libs/Mistral.ts` remains the shared chat completion interface
- Arcjet remains available for per-user response throttling
- Dashboard exercise cards remain the primary interaction surface

### Key risks and mitigations

1. Mistral free-tier throughput may feel slow for rapid-fire learner submissions.
   - Mitigation: deterministic evaluation for objective types, fallback to LLM only where it adds value, and explicit `429` handling.

2. Single-answer prompts may overfit to sample answers and give narrow feedback.
   - Mitigation: include grading criteria in the prompt and instruct the model to reward equivalent correct formulations.

3. Response history could grow quickly if learners retry often.
   - Mitigation: keep bootstrap to latest response summary only; full history UI is out of scope for this phase.

4. Hybrid scoring adds branching complexity.
   - Mitigation: centralize all branches in `AnswerEvaluation.ts` with a single normalized output schema and dedicated unit tests.

5. Sanitized DTOs add one more mapping layer.
   - Mitigation: keep the presenter module small and type-driven rather than leaking raw `exerciseData` into components.

---

## Success metrics

- 100% of persisted responses contain a valid rubric payload and overall feedback
- Objective submissions return in under 500ms locally
- LLM-backed submissions complete within an acceptable interactive threshold (target p95 under 6s in normal conditions)
- Duplicate submission retries do not increase `responses` row count or exercise aggregates
- Reloading the exercises dashboard preserves latest-response visibility for evaluated exercises

---

## Sources and references

### Parent plan

- `docs/plans/2026-02-28-feat-italian-rag-learning-tool-plan.md`
  - Carried forward requirements:
    - `POST /api/responses/submit`
    - rubric-based scoring
    - response persistence
    - exercise stat updates

### Internal references

- `src/models/Schema.ts:120-135` - exercise aggregates and `responses` table shape
- `src/libs/Mistral.ts:168-223` - structured and JSON chat completion helpers
- `src/app/[locale]/api/exercises/generate/route.ts:45-148` - current route contract for auth, parse, rate limit, and error mapping
- `src/app/[locale]/api/exercises/route.ts:8-44` - exercises bootstrap payload
- `src/components/exercises/ExercisesDashboard.tsx:74-258` - existing dashboard bootstrap, polling, and request merge behavior
- `src/components/exercises/ExerciseCards.tsx:17-123` - current answer-leaking exercise rendering that Phase 4 must replace
- `src/validations/ExerciseValidation.ts:8-95` - current schema patterns for discriminated unions and output validation

### Institutional learnings

- `docs/solutions/integration-issues/exercise-generation-hardening-pr23-system-20260305.md`
  - Carry forward:
    - explicit malformed-JSON handling
    - overlap protection for async client loops
    - explicit `4xx` vs `5xx` failure mapping

### External references

- [Next.js route handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
- [Drizzle transactions](https://orm.drizzle.team/docs/transactions)
- [Drizzle insert](https://orm.drizzle.team/docs/insert)
- [Drizzle select](https://orm.drizzle.team/docs/select)
- [Zod API](https://zod.dev/api)

### Out of scope

- Full response history page
- Teacher/admin review workflow
- Async answer-evaluation job queue
- Spaced-repetition scheduling based on scores
