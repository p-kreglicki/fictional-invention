---
status: complete
priority: p2
issue_id: "027"
tags: [code-review, api, reliability, error-handling]
dependencies: []
---

# Enqueue internal failures are returned as client validation errors

## Problem Statement

`POST /api/exercises/generate` maps almost all enqueue failures to HTTP `422`, including internal failures like inability to create a generation job row.

**Why it matters:** Clients receive misleading error classification, retry behavior is harder to implement correctly, and operational alerts undercount server-side failures.

## Findings

- Route status mapping defaults to `422` for non-document errors in [generate route](/Users/piotrkreglicki/Projects/exercise-maker/src/app/[locale]/api/exercises/generate/route.ts:107).
- Enqueue can return `GENERATION_FAILED` for server-side failures in [ExerciseGeneration.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/ExerciseGeneration.ts:739).
- Current tests cover malformed payload and document-not-found paths, but not server-failure mapping.

## Proposed Solutions

### Option 1: Map internal enqueue errors to 500 (Recommended)

**Approach:** Use explicit status mapping: `VALIDATION_FAILED`/`DOCUMENTS_NOT_READY` -> `422`, `DOCUMENTS_NOT_FOUND` -> `404`, `GENERATION_FAILED` -> `500`.

**Pros:**
- Correct HTTP semantics.
- Better client and monitoring behavior.

**Cons:**
- Requires minor response contract update.

**Effort:** Small

**Risk:** Low

---

### Option 2: Add retryable metadata while keeping status codes

**Approach:** Keep response codes but include `retryable: boolean` and machine-readable category.

**Pros:**
- Backward-compatible for existing consumers.

**Cons:**
- Preserves incorrect HTTP semantics.

**Effort:** Small

**Risk:** Medium

---

### Option 3: Throw typed errors from service and centralize mapping

**Approach:** Replace union result with typed error classes mapped in route layer.

**Pros:**
- Cleaner long-term error architecture.

**Cons:**
- Larger refactor scope.

**Effort:** Medium

**Risk:** Medium

## Recommended Action

Map enqueue failure codes explicitly and return `500` for `GENERATION_FAILED`. Keep `404/422` for user-correctable cases, and add route test coverage for the internal-failure branch.

## Technical Details

**Affected files:**
- `src/app/[locale]/api/exercises/generate/route.ts`
- `src/libs/ExerciseGeneration.ts`
- `src/app/[locale]/api/exercises/generate/route.test.ts`

## Resources

- PR: https://github.com/p-kreglicki/fictional-invention/pull/23
- Source: `src/app/[locale]/api/exercises/generate/route.ts`

## Acceptance Criteria

- [x] `GENERATION_FAILED` returns HTTP `500`
- [x] Client-side validation/document-state failures still return `4xx`
- [x] Route tests assert internal-failure status mapping
- [x] Logs and monitoring can distinguish client vs server failures

## Work Log

### 2026-03-05 - Initial discovery

**By:** Codex (ce-review)

**Actions:**
- Audited route-level error/status mapping.
- Traced service return codes to identify server-failure path.
- Compared existing test coverage against mapping branches.

**Learnings:**
- Error code taxonomy exists, but HTTP mapping currently collapses important distinctions.

### 2026-03-05 - Implementation completed

**By:** Codex

**Actions:**
- Added `getEnqueueFailureStatus` in [`src/app/[locale]/api/exercises/generate/route.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/app/[locale]/api/exercises/generate/route.ts) to map server/internal enqueue failures to `500`.
- Updated route behavior to use explicit error-code mapping instead of defaulting non-document errors to `422`.
- Added regression test `returns 500 for internal enqueue failures` in [`src/app/[locale]/api/exercises/generate/route.test.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/app/[locale]/api/exercises/generate/route.test.ts).
- Verified with `npm test -- 'src/app/[locale]/api/exercises/generate/route.test.ts'`, `npm run check:types`, and `npm run lint`.

**Learnings:**
- Explicit mapping prevents client/server error conflation and improves API contract clarity.

## Notes

- Fixing this now reduces ambiguity for both UI and API consumers.
