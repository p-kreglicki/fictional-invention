---
status: pending
priority: p1
issue_id: "019"
tags: [code-review, architecture, reliability, background-jobs]
dependencies: []
---

# In-process timer worker can drop generation jobs

## Problem Statement

Generation jobs are queued with `setTimeout(..., 0)` inside the API process. If the process is recycled or suspended after the HTTP response, the job row remains `pending` and never executes until stale recovery flips it to failed.

**Why it matters:** This can cause lost work and high failure rates in environments without durable background workers.

## Findings

- Job dispatch relies on in-memory timer in [ExerciseGeneration.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/ExerciseGeneration.ts:449).
- API route returns `202` immediately after enqueue in [generate route](/Users/piotrkreglicki/Projects/exercise-maker/src/app/[locale]/api/exercises/generate/route.ts:101), but there is no durable queue handoff.
- Plan docs explicitly note deferred in-process execution (`setTimeout`) and no external queue, which leaves delivery guarantees best-effort only.

## Proposed Solutions

### Option 1: Durable queue + worker process (Recommended)

**Approach:** Persist dispatch to a queue (e.g., DB-backed queue, SQS, BullMQ) and process jobs in a dedicated worker.

**Pros:**
- At-least-once processing semantics.
- Survives API process restarts/redeploys.

**Cons:**
- Adds infrastructure and operational complexity.

**Effort:** Large

**Risk:** Medium

---

### Option 2: Database claim-loop worker

**Approach:** Add a scheduled worker that claims pending jobs with row locks and executes them.

**Pros:**
- No external queue service required.
- More reliable than request-process timers.

**Cons:**
- Requires scheduler/cron setup.
- Needs careful locking/idempotency handling.

**Effort:** Medium

**Risk:** Medium

---

### Option 3: Keep timer worker but gate deployment targets

**Approach:** Document and enforce deployment only on long-lived Node processes.

**Pros:**
- Minimal code change.
- Fastest short-term path.

**Cons:**
- Fragile architecture constraint.
- Easy to violate during future infra changes.

**Effort:** Small

**Risk:** High

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

**Affected files:**
- `src/libs/ExerciseGeneration.ts`
- `src/app/[locale]/api/exercises/generate/route.ts`

**Related components:**
- Stale recovery behavior in `recoverStaleGenerationJobs`

## Resources

- PR: https://github.com/p-kreglicki/fictional-invention/pull/23
- Source: `src/libs/ExerciseGeneration.ts:449`

## Acceptance Criteria

- [ ] Job dispatch survives API process recycle/redeploy
- [ ] Pending jobs are picked up by a durable worker mechanism
- [ ] Duplicate execution is prevented (claim/lock/idempotency strategy documented)
- [ ] Tests or runbook cover worker interruption and recovery scenarios

## Work Log

### 2026-03-05 - Initial discovery

**By:** Codex (ce-review)

**Actions:**
- Traced enqueue flow from API route to async worker dispatch.
- Verified worker launch mechanism is in-memory timer only.
- Assessed failure mode when runtime lifecycle ends after response.

**Learnings:**
- The current approach is best-effort async, not durable background processing.
- Stale recovery limits impact but does not recover lost jobs.

## Notes

- This is merge-blocking for deployments expecting reliable async execution.
