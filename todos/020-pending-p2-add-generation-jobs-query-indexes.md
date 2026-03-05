---
status: pending
priority: p2
issue_id: "020"
tags: [code-review, performance, database, generation-jobs]
dependencies: []
---

# Generation jobs table is missing indexes for hot queries

## Problem Statement

The new `generation_jobs` table has no non-PK indexes, but read/write paths repeatedly filter by `user_id`, `status`, and timestamps. Polling every 2 seconds amplifies this cost as data grows.

**Why it matters:** Query latency and write amplification will degrade as jobs accumulate, especially for stale-recovery updates and active job listing.

## Findings

- Migration creates table and FK only, with no indexes in [0002 migration](/Users/piotrkreglicki/Projects/exercise-maker/migrations/0002_phase3_generation_jobs.sql:2).
- Active jobs query filters by `(user_id, status)` and sorts by `created_at` in [ExerciseGeneration.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/ExerciseGeneration.ts:655).
- Stale recovery updates by `status` + `created_at` (+ optional `user_id`) in [ExerciseGeneration.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/ExerciseGeneration.ts:468).

## Proposed Solutions

### Option 1: Add targeted composite indexes (Recommended)

**Approach:** Add migration indexes such as:
- `(user_id, status, created_at DESC)` for active listing
- `(status, created_at)` for stale recovery

**Pros:**
- Improves hot path query plans quickly.
- No behavioral change to app logic.

**Cons:**
- Extra index storage and write cost.

**Effort:** Small

**Risk:** Low

---

### Option 2: Partial indexes by status

**Approach:** Add partial indexes for `status IN ('pending','processing')`.

**Pros:**
- Smaller/faster indexes for dominant live statuses.

**Cons:**
- More migration complexity.

**Effort:** Medium

**Risk:** Low

---

### Option 3: Keep schema as-is and prune aggressively

**Approach:** Periodically delete old completed/failed jobs to limit scan sizes.

**Pros:**
- No immediate schema change.

**Cons:**
- Treats symptoms, not root cause.
- Operational burden.

**Effort:** Medium

**Risk:** Medium

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

**Affected files:**
- `migrations/0002_phase3_generation_jobs.sql`
- `src/libs/ExerciseGeneration.ts`

**Database changes (if any):**
- Yes, additive index migration.

## Resources

- PR: https://github.com/p-kreglicki/fictional-invention/pull/23
- Source: `migrations/0002_phase3_generation_jobs.sql`

## Acceptance Criteria

- [ ] Composite/partial indexes are added for active jobs and stale-recovery paths
- [ ] Query plans for list/recovery use indexes in representative environments
- [ ] API polling remains performant with large `generation_jobs` row counts

## Work Log

### 2026-03-05 - Initial discovery

**By:** Codex (ce-review)

**Actions:**
- Reviewed migration DDL and hot query paths.
- Cross-checked polling cadence and stale-recovery frequency.
- Identified missing index coverage for dominant predicates.

**Learnings:**
- Polling architectures need index support at creation time to avoid fast degradation.

## Notes

- Keep this separate from functional fixes so it can be benchmarked independently.
