---
status: complete
priority: p1
issue_id: "025"
tags: [code-review, reliability, architecture, async-jobs]
dependencies: []
---

# Generation dispatch is not durable across process lifecycle

## Problem Statement

Exercise generation relies on an in-process worker trigger in the API runtime. If the process is suspended/recycled after returning `202`, queued jobs can remain `pending` until stale recovery fails them.

**Why it matters:** This can drop user-requested work in production environments that do not guarantee post-response background execution.

## Findings

- `POST /api/exercises/generate` enqueues then triggers worker without awaiting completion in [route.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/app/[locale]/api/exercises/generate/route.ts:136).
- Worker execution is process-local state (`globalThis`) in [ExerciseGeneration.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/ExerciseGeneration.ts:660).
- Internal dispatch endpoint exists, but repository-level search shows no scheduler/cron integration invoking it.

## Proposed Solutions

### Option 1: Add durable scheduler-driven dispatch (Recommended)

**Approach:** Schedule recurring calls to `/api/internal/generation-jobs/dispatch` (or equivalent worker entrypoint) in deployment infrastructure.

**Pros:**
- Survives request lifecycle termination.
- Smallest code change to improve reliability quickly.

**Cons:**
- Requires deployment config and secret management.

**Effort:** Medium

**Risk:** Low

---

### Option 2: Move to dedicated background worker queue

**Approach:** Use a durable queue (DB-backed queue, SQS, BullMQ) with explicit worker process.

**Pros:**
- Stronger delivery guarantees.
- Better scaling and observability patterns.

**Cons:**
- Larger implementation and ops footprint.

**Effort:** Large

**Risk:** Medium

---

### Option 3: Keep in-process worker and constrain runtime model

**Approach:** Document and enforce only long-lived Node runtime deployments.

**Pros:**
- Minimal code work.

**Cons:**
- Operationally fragile.
- Easy to regress in future deployments.

**Effort:** Small

**Risk:** High

## Recommended Action

Configure a scheduled dispatch path in deployment and secure it with bearer-token auth so pending jobs are claimed independently of the request lifecycle. Retain manual dispatch for operational recovery.

## Technical Details

**Affected files:**
- `src/app/[locale]/api/exercises/generate/route.ts`
- `src/libs/ExerciseGeneration.ts`
- `src/app/api/internal/generation-jobs/dispatch/route.ts`

**Related components:**
- Generation job lifecycle and stale recovery

## Resources

- PR: https://github.com/p-kreglicki/fictional-invention/pull/23
- Worker trigger: `src/libs/ExerciseGeneration.ts`

## Acceptance Criteria

- [x] Pending generation jobs are processed even if request process exits immediately
- [x] Dispatch mechanism is documented and configured in target deployment
- [x] Runbook includes recovery steps for worker interruption
- [x] Reliability test proves jobs are eventually claimed under process restarts

## Work Log

### 2026-03-05 - Initial discovery

**By:** Codex (ce-review)

**Actions:**
- Traced enqueue-to-worker flow from API route through generation service.
- Confirmed worker locking is in-memory and process-scoped.
- Checked repository for scheduler wiring for dispatch endpoint.

**Learnings:**
- Current execution path is best-effort unless external dispatch is configured.

### 2026-03-05 - Scheduler-driven dispatch implemented

**By:** Codex

**Actions:**
- Added Vercel cron scheduling in [`vercel.json`](/Users/piotrkreglicki/Projects/exercise-maker/vercel.json) for `GET /api/internal/generation-jobs/dispatch`.
- Updated the internal dispatch route to accept either `CRON_SECRET` or `GENERATION_DISPATCH_TOKEN` via constant-time bearer comparison in [`src/app/api/internal/generation-jobs/dispatch/route.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/app/api/internal/generation-jobs/dispatch/route.ts).
- Added route coverage in [`src/app/api/internal/generation-jobs/dispatch/route.test.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/app/api/internal/generation-jobs/dispatch/route.test.ts) for cron `GET`, manual `POST`, and CRON-only auth.
- Added worker regression coverage in [`src/libs/ExerciseGeneration.worker.test.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/ExerciseGeneration.worker.test.ts) showing later batch runs can continue draining persisted pending jobs.
- Documented production setup and manual recovery steps in [`README.md`](/Users/piotrkreglicki/Projects/exercise-maker/README.md).

**Learnings:**
- Repo-owned scheduler config closes the operational gap that made the dispatch endpoint effectively dormant in production.
- The dispatch endpoint is enough for durability because job claiming is already DB-backed and idempotent.

## Notes

- Merge blocking for production targets that do not guarantee in-process background execution.
