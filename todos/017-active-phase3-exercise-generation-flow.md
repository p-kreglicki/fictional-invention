---
status: complete
priority: p1
issue_id: "017"
tags: [feature, exercise-generation, api, dashboard, rag, mistral, pinecone]
dependencies: []
---

# Phase 3 Exercise Generation Flow (API + Dashboard UI)

## Goal

Ship end-to-end async exercise generation from user documents with:
- generation jobs and lifecycle tracking
- Pinecone retrieval + Mistral structured generation
- strict validation and persistence
- dashboard UI for request, polling, and results

## Task Breakdown

### Foundation

- [x] Add generation jobs schema, enum, and migration (`0002_phase3_generation_jobs.sql`)
  - Depends on: none
  - Deliverables:
    - `generation_job_status` enum
    - `generation_jobs` table with lifecycle fields
    - `exercise_ids` SQL empty-array default
  - Verification:
    - migration applies cleanly
    - schema exports compile

- [x] Extend environment validation and defaults in `Env.ts`
  - Depends on: none
  - Deliverables:
    - `MISTRAL_CHAT_REQUEST_DELAY_MS`
    - `EXERCISE_RATE_LIMIT_MAX_REQUESTS`
    - `EXERCISE_RATE_LIMIT_WINDOW_SECONDS`
  - Verification:
    - runtime boot with and without optional values

### Domain and orchestration

- [x] Add exercise validation schemas and structured-output parsing
  - Depends on: foundation tasks
  - Deliverables:
    - request schema (`documentIds`, `exerciseType`, `count`, optional `difficulty`, `topicFocus`)
    - discriminated union output schemas for all exercise types
    - parser that accepts only validated payloads
  - Verification:
    - unit tests for valid/invalid payloads and type constraints

- [x] Add prompt builder and Mistral chat helper
  - Depends on: validation task
  - Deliverables:
    - system/user prompts with injection hardening and Italian-only output
    - Mistral chat completion helper with structured output + fallback
  - Verification:
    - prompt tests for delimiter and required instruction coverage

- [x] Implement generation orchestration and retrieval service
  - Depends on: schema, env, validation, prompt/Mistral tasks
  - Deliverables:
    - Pinecone retrieval with `user_id`/`document_id` filters and `include_values=false`
    - deterministic chunk subset selection
    - batched chunk UUID resolution from DB
    - generation retry loop (max 3), transactional counter updates, terminal status logic
    - stale-job recovery for interrupted workers
  - Verification:
    - unit/integration tests for happy path, partial success, full failure, no-content, stale recovery

### API delivery

- [x] Implement `POST /api/exercises/generate`
  - Depends on: orchestration task
  - Deliverables:
    - auth (`requireUser`)
    - rate limit by `userId`
    - request validation
    - document ownership + ready-state checks
    - job insert + deferred execution + `202` response
  - Verification:
    - route tests for `202`, `401`, `404`, `422`, `429`

- [x] Implement `GET /api/exercises/jobs/[id]`
  - Depends on: orchestration task
  - Deliverables:
    - auth + ownership scope
    - job status/counters/error payload
    - generated exercises in response for live UI rendering
  - Verification:
    - route tests for owned/non-owned/missing jobs and payload shape

- [x] Implement `GET /api/exercises`
  - Depends on: schema task
  - Deliverables:
    - auth scope
    - latest generated exercises for reload/history
  - Verification:
    - route tests for auth and response ordering/content

### Dashboard and i18n

- [x] Build dashboard exercises page and components
  - Depends on: API route tasks
  - Deliverables:
    - page and nav link
    - `ExerciseGeneratorForm`, `GenerationJobStatus`, `ExerciseCards`
    - polling every 2s to terminal state with partial-result rendering
    - reload behavior with `/api/exercises` and active jobs bootstrap
  - Verification:
    - UI tests for form validation, polling transitions, per-type rendering, empty/error states

- [x] Add translation keys for `DashboardExercisesPage`
  - Depends on: dashboard task
  - Deliverables:
    - `en.json` + `fr.json` namespace updates
    - no hardcoded UI strings
  - Verification:
    - i18n smoke checks in page/components

### Quality and ship readiness

- [x] Add observability logs and operational validation notes
  - Depends on: orchestration + API tasks
  - Deliverables:
    - structured events for queued/started/completed/failed + retry failures
    - metrics hooks/counters if existing infra allows
    - post-deploy monitoring checklist for PR description
  - Verification:
    - log events emitted across success/failure paths

- [x] Run final quality gates
  - Depends on: all tasks
  - Deliverables:
    - relevant tests and full suite green
    - lint passes
    - plan checkboxes updated where applicable
  - Verification:
    - test + lint command outputs clean

## Risks to watch during implementation

- In-process deferred worker interruption can leave stale jobs unless recovery runs on enqueue and poll paths.
- Partial generation persistence must remain idempotent across retries.
- Ownership scope must match across DB, Pinecone filters, and route authorization.
