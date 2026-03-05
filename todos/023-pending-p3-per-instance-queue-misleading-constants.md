---
status: pending
priority: p3
issue_id: "023"
tags: [code-review, performance, serverless, documentation]
dependencies: []
---

# Module-level Queue State Is Per-Instance — Constants Imply a Global Bound

## Problem Statement

`activeJobs` and `pendingJobs` are module-level variables. On Vercel, each warm serverless container has its own isolated module scope. `MAX_CONCURRENT_DEFERRED_JOBS = 10` is enforced *per container*, not per deployment. Under load, Vercel spins up multiple containers; the true active-job ceiling is `10 × N_containers`. The constant names and PR description imply a global bound that does not exist.

**Why it matters:** Operators reading the code or the PR will believe concurrent processing is capped at 10. Under a burst that triggers 5 warm containers, the actual cap is 50, which may produce unexpected memory pressure and defeats the stated goal of preventing OOM.

## Findings

**Source:** Performance Oracle Agent (PR #21 review)

**Location:** `src/app/[locale]/api/documents/upload/route.ts` lines 25–26, 56–57

```typescript
const MAX_CONCURRENT_DEFERRED_JOBS = 10;  // sounds global
const QUEUE_WARNING_THRESHOLD = 20;       // sounds global

let activeJobs = 0;           // per-container
const pendingJobs: DeferredUploadJob[] = [];  // per-container
```

**Scope of impact:**

- Single Vercel container: constants are accurate.
- Multiple warm containers: effective limit = `10 × container_count`.
- Local dev (single Node process): constants are accurate.

This is an inherent limitation of in-process queuing on serverless — not a bug introduced by this PR. The issue is the undocumented assumption.

## Proposed Solutions

### Option 1: Add clarifying JSDoc comments (Recommended)

```typescript
/**
 * Maximum concurrent deferred upload jobs per server instance.
 * In multi-instance deployments (e.g. Vercel), this limit applies per container,
 * not globally across the deployment.
 */
const MAX_CONCURRENT_DEFERRED_JOBS = 10;

/**
 * Soft warning threshold for the pending queue per server instance.
 */
const QUEUE_WARNING_THRESHOLD = 20;
```

**Pros:** Zero runtime change; documents the constraint for future maintainers.
**Cons:** Does not fix the multi-instance issue.
**Effort:** Trivial
**Risk:** None

### Option 2: Move to external queue (BullMQ + Redis)

Replace the in-process queue with a Redis-backed job queue (BullMQ, `pg-boss`, etc.).

**Pros:** True global concurrency limit; survives restarts; observable via queue dashboard.
**Cons:** Adds infrastructure dependency (Redis); significant refactor; may be over-engineered for current scale.
**Effort:** Large
**Risk:** Medium

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

**Affected files:**
- `src/app/[locale]/api/documents/upload/route.ts`

**No runtime fix needed** for Option 1 — documentation change only.

## Acceptance Criteria

- [ ] `MAX_CONCURRENT_DEFERRED_JOBS` and `QUEUE_WARNING_THRESHOLD` have JSDoc comments noting per-instance scope
- [ ] `activeJobs` and `pendingJobs` declarations include inline comment noting per-instance scope

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from PR #21 performance review | Performance Oracle flagged misleading constant names in serverless context |

## Resources

- PR: #21 fix/bounded-deferred-queue
- File: `src/app/[locale]/api/documents/upload/route.ts:25-26,56-57`
