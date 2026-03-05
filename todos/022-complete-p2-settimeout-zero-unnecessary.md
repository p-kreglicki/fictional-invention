---
status: complete
priority: p2
issue_id: "022"
tags: [code-review, performance, event-loop]
dependencies: []
---

# setTimeout(fn, 0) in startDeferredJob Adds Unnecessary Latency

## Problem Statement

`startDeferredJob` wraps `runDeferredUpload` in a `setTimeout(fn, 0)`. The stated rationale is to yield the event loop so the HTTP response is sent before processing begins. This is unnecessary: the response is already queued for dispatch as soon as `handlePdfUpload` returns its `NextResponse`, which happens synchronously before any `setTimeout` callback fires. The wrapper adds ≥1 ms of latency per job (Node.js coerces `setTimeout(fn, 0)` to 1 ms minimum) and weakens the error boundary.

## Findings

**Source:** Performance Oracle Agent (PR #21 review)

**Location:** `src/app/[locale]/api/documents/upload/route.ts` lines 194–196

```typescript
function startDeferredJob(input: DeferredUploadJob) {
  activeJobs++;
  logger.info('Deferred job started', { ... });
  setTimeout(() => {
    void runDeferredUpload(input);
  }, 0);
}
```

**Why the setTimeout is redundant:**

The call chain is:
```
POST (async)
  └─ handlePdfUpload (async, awaited)
       └─ queueDeferredUpload (sync)
            └─ startDeferredJob (sync)
                 └─ setTimeout(runDeferredUpload, 0)  ← fires AFTER POST returns
  └─ return response  ← happens before setTimeout fires
```

The response is dispatched when `POST` returns its `NextResponse`. That return already happens before the event loop gets to the `setTimeout` callback. The yield is free.

**Additional concern:** If `runDeferredUpload` were ever to throw synchronously at construction time (e.g., a library constructor throws), the `void` discard inside `setTimeout` silently loses the error and `activeJobs` is never decremented. The `finally` block inside `runDeferredUpload` does not execute on a synchronous throw from outside it.

## Proposed Solutions

### Option 1: Replace with direct void call (Recommended)

```typescript
function startDeferredJob(input: DeferredUploadJob) {
  activeJobs++;
  logger.info('Deferred job started', { ... });
  void runDeferredUpload(input);
}
```

**Pros:** Removes spurious 1 ms delay; simplifies code; improves debuggability; no behavioral change for callers.
**Cons:** None.
**Effort:** Trivial
**Risk:** Low

### Option 2: Use queueMicrotask instead

```typescript
queueMicrotask(() => { void runDeferredUpload(input); });
```

Yields to any pending microtasks (Promise callbacks) without the 1 ms timer cost. Functionally equivalent to Option 1 for this pattern since the response `NextResponse` object is already constructed before `startDeferredJob` is called.

**Pros:** Marginally more explicit about yielding intent.
**Cons:** Adds complexity for no observable benefit here.
**Effort:** Trivial
**Risk:** Low

## Recommended Action

Replace the raw `setTimeout(fn, 0)` with a dedicated scheduler helper that prefers `setImmediate` and falls back to `setTimeout` only when `setImmediate` is unavailable. Keep the macrotask boundary so uploads still return `202` before any deferred extraction starts, and add a route test that proves response ordering for URL uploads.

## Technical Details

**Affected files:**
- `src/app/[locale]/api/documents/upload/route.ts`
- `src/app/[locale]/api/documents/upload/route.test.ts`

**Overhead per active job:** ≥1 ms startup delay × 10 concurrent = ≥10 ms unnecessary delay at full concurrency.

## Acceptance Criteria

- [x] `startDeferredJob` no longer relies on `setTimeout` in the Node runtime path
- [x] Deferred jobs are started through a dedicated macrotask scheduler helper
- [x] HTTP response still returns 202 before any job processing begins

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from PR #21 performance review | Performance Oracle identified unnecessary timer overhead |
| 2026-03-05 | Replaced the zero-delay timer with a scheduler helper that prefers `setImmediate`, kept a `setTimeout` fallback for non-Node environments, and added a test proving the route returns `202` before URL extraction starts | Direct invocation and `queueMicrotask` would start deferred work too early; preserving a macrotask boundary avoids changing response timing |

## Resources

- PR: #21 fix/bounded-deferred-queue
- File: `src/app/[locale]/api/documents/upload/route.ts:194-196`
