---
status: pending
priority: p2
issue_id: "021"
tags: [code-review, api, validation, reliability]
dependencies: []
---

# Job status endpoint does not validate job ID format

## Problem Statement

`GET /api/exercises/jobs/[id]` passes route param `id` directly into a UUID-typed DB predicate. Malformed IDs can trigger database errors and return `500` instead of a controlled client error.

**Why it matters:** Invalid user input should not produce internal server errors. This weakens API robustness and poller stability.

## Findings

- Route forwards `id` unvalidated in [jobs route](/Users/piotrkreglicki/Projects/exercise-maker/src/app/[locale]/api/exercises/jobs/[id]/route.ts:16).
- Service query compares UUID column against raw string in [ExerciseGeneration.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/ExerciseGeneration.ts:575).
- Route tests mock service and do not cover malformed UUID behavior against the real DB adapter in [route.test.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/app/[locale]/api/exercises/jobs/[id]/route.test.ts:41).

## Proposed Solutions

### Option 1: Validate route param as UUID before query (Recommended)

**Approach:** Parse `id` with Zod UUID schema in route; return `404` (or `422`) when invalid.

**Pros:**
- Prevents DB type-cast exceptions.
- Keeps API behavior deterministic.

**Cons:**
- Small route-level boilerplate.

**Effort:** Small

**Risk:** Low

---

### Option 2: Handle DB invalid-UUID errors centrally

**Approach:** Catch specific DB error code and map to `404/422`.

**Pros:**
- Reusable for other endpoints.

**Cons:**
- Relies on driver-specific error inspection.

**Effort:** Medium

**Risk:** Medium

---

### Option 3: Introduce typed route-params validation utility

**Approach:** Shared helper for validating all `[id]` params across API routes.

**Pros:**
- Consistent pattern across endpoints.

**Cons:**
- More refactor scope now.

**Effort:** Medium

**Risk:** Low

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

**Affected files:**
- `src/app/[locale]/api/exercises/jobs/[id]/route.ts`
- `src/libs/ExerciseGeneration.ts`
- `src/app/[locale]/api/exercises/jobs/[id]/route.test.ts`

## Resources

- PR: https://github.com/p-kreglicki/fictional-invention/pull/23
- Source: `src/app/[locale]/api/exercises/jobs/[id]/route.ts`

## Acceptance Criteria

- [ ] Malformed job IDs do not trigger `500`
- [ ] Endpoint returns controlled `404` or `422` for invalid ID format
- [ ] Tests include malformed UUID integration path

## Work Log

### 2026-03-05 - Initial discovery

**By:** Codex (ce-review)

**Actions:**
- Traced route param handling to DB predicate.
- Verified absence of UUID validation before query.
- Audited existing tests for malformed-ID coverage.

**Learnings:**
- Current tests verify happy-path serialization but not parameter hardening.
