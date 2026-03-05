---
status: pending
priority: p1
issue_id: "018"
tags: [code-review, reliability, async-jobs, data-integrity]
dependencies: []
---

# Processing jobs are failed using created time instead of started time

## Problem Statement

Stale job recovery marks both `pending` and `processing` jobs as failed using only `created_at < now - 10m`. A long-running job can be healthy but still older than 10 minutes from creation and be force-failed mid-execution.

**Why it matters:** Active generation can be incorrectly failed, producing user-visible false failures and inconsistent terminal states.

## Findings

- `recoverStaleGenerationJobs` applies `lt(generationJobsSchema.createdAt, staleBefore)` for both statuses in [ExerciseGeneration.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/ExerciseGeneration.ts:473).
- Processing starts later (`startedAt` is set when worker begins) in [ExerciseGeneration.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/ExerciseGeneration.ts:296), but recovery never uses it.
- Recovery runs during enqueue and poll/list paths ([ExerciseGeneration.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/ExerciseGeneration.ts:520), [ExerciseGeneration.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/ExerciseGeneration.ts:571), [ExerciseGeneration.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/ExerciseGeneration.ts:640)), so false failure can happen while job is still running.

## Proposed Solutions

### Option 1: Split staleness rules by status (Recommended)

**Approach:** Use `created_at` threshold for `pending` jobs and `started_at` threshold for `processing` jobs.

**Pros:**
- Matches lifecycle semantics.
- Prevents premature failure for active work.

**Cons:**
- Slightly more complex query logic.

**Effort:** Small

**Risk:** Low

---

### Option 2: Track heartbeat timestamp

**Approach:** Add `last_progress_at` and update it during each iteration; stale recovery uses this field.

**Pros:**
- More accurate interruption detection.
- Supports future multi-worker orchestration.

**Cons:**
- Requires schema migration and more writes.

**Effort:** Medium

**Risk:** Medium

---

### Option 3: Raise timeout threshold

**Approach:** Increase stale threshold above worst-case job duration.

**Pros:**
- Fast mitigation.
- No schema changes.

**Cons:**
- Still logically incorrect for very long jobs.
- Delays true interruption detection.

**Effort:** Small

**Risk:** Medium

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

**Affected files:**
- `src/libs/ExerciseGeneration.ts`

**Database changes (if any):**
- No migration required for Option 1.
- Migration required for Option 2.

## Resources

- PR: https://github.com/p-kreglicki/fictional-invention/pull/23
- Source: `src/libs/ExerciseGeneration.ts`

## Acceptance Criteria

- [ ] `pending` staleness is based on creation time only
- [ ] `processing` staleness is based on start/progress time
- [ ] Active jobs are not marked failed during normal long-running generation
- [ ] Regression tests cover stale recovery for pending vs processing states

## Work Log

### 2026-03-05 - Initial discovery

**By:** Codex (ce-review)

**Actions:**
- Reviewed async lifecycle and stale recovery conditions.
- Traced call paths where stale recovery executes.
- Identified status/timestamp mismatch with line-level evidence.

**Learnings:**
- Recovery is invoked frequently from API reads/writes, so stale logic must be precise.
- Processing jobs need a different timeout baseline than queued jobs.

## Notes

- This is merge-blocking because it can mark healthy jobs as failed under expected runtimes.
