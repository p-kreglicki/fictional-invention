---
status: complete
priority: p1
issue_id: "019"
tags: [code-review, performance, memory, back-pressure]
dependencies: []
---

# No Hard Limit on pendingJobs Array — Unbounded Buffer Growth

## Problem Statement

`queueDeferredUpload` pushes jobs into `pendingJobs` without any upper-bound check. `QUEUE_WARNING_THRESHOLD = 20` emits a log warning but still accepts the job. Under a burst of 50+ concurrent PDF uploads, all 40+ excess jobs accumulate in the array, each holding a closure that captures a 10 MB `Buffer`. This is the primary OOM path the PR was intended to close but did not fully address.

**Why it matters:** The PR caps *active* concurrency at 10 but places no cap on *queued* work. On Vercel (default 1 GB / free tier 512 MB), a burst of 50 PDF uploads yields ≥500 MB pinned in heap before a single job drains.

## Findings

**Source:** Performance Oracle Agent (PR #21 review)

**Location:** `src/app/[locale]/api/documents/upload/route.ts` lines 203–222

```typescript
function queueDeferredUpload(input: DeferredUploadJob) {
  if (activeJobs < MAX_CONCURRENT_DEFERRED_JOBS) {
    startDeferredJob(input);
    return;
  }

  pendingJobs.push(input);  // no size guard

  if (pendingJobs.length >= QUEUE_WARNING_THRESHOLD) {
    logger.warn('Deferred job queue growing large', { ... });
    // job is still accepted
  }
}
```

**Impact at scale:**

| Active jobs | Queued jobs | PDF buffers in heap |
|-------------|-------------|---------------------|
| 10          | 20 (warning)| 300 MB              |
| 10          | 40          | 500 MB              |
| 10          | unlimited   | OOM                 |

## Proposed Solutions

### Option 1: Reject with 503 + markDocumentAsFailed (Recommended)

Add a `MAX_PENDING_JOBS` constant and, when exceeded, call `markDocumentAsFailed` then return a signal the caller can use to respond 503.

```typescript
const MAX_PENDING_JOBS = 50;

// queueDeferredUpload returns a boolean success indicator
function queueDeferredUpload(input: DeferredUploadJob): boolean {
  if (activeJobs < MAX_CONCURRENT_DEFERRED_JOBS) {
    startDeferredJob(input);
    return true;
  }
  if (pendingJobs.length >= MAX_PENDING_JOBS) {
    return false;  // caller marks document failed and responds 503
  }
  pendingJobs.push(input);
  ...
  return true;
}
```

**Pros:** Fail-fast; document slot stays consistent (marked failed, not stuck in `uploading`); client can retry.
**Cons:** Adds a return value to a void function — requires updating three call sites.
**Effort:** Small
**Risk:** Low

### Option 2: Throw an Error from queueDeferredUpload

Throw `new Error('Queue full')` instead of returning a boolean. Catch in each handler.

**Pros:** No signature change for callers that already catch.
**Cons:** Using exceptions for control flow is non-idiomatic here; call sites still need `markDocumentAsFailed`.
**Effort:** Small
**Risk:** Low

### Option 3: Silent drop (no back-pressure to client)

Cap the array silently and log an error. Document stays in `uploading` forever.

**Pros:** Zero call-site changes.
**Cons:** Orphaned documents in `uploading` state; client never learns the job was dropped; contradicts the intent of `markDocumentAsFailed`.
**Effort:** Trivial
**Risk:** High (data integrity)

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

**Affected files:**
- `src/app/[locale]/api/documents/upload/route.ts`

**New constants needed:**
- `MAX_PENDING_JOBS = 50` (or configurable via Env)

**Call sites to update (if Option 1):**
- `handlePdfUpload` (~line 353)
- `handleUrlUpload` (~line 431)
- `handleTextUpload` (~line 491)

## Acceptance Criteria

- [x] `pendingJobs` cannot grow beyond `MAX_PENDING_JOBS`
- [x] When the limit is hit, the document is marked failed (not left in `uploading`)
- [x] Caller receives a 503 with `Retry-After: 30` header
- [x] Existing warning log at `QUEUE_WARNING_THRESHOLD` is preserved
- [ ] Unit test: queue at capacity → new job rejected → document marked failed

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from PR #21 performance review | Performance Oracle identified back-pressure gap |
| 2026-03-02 | Fixed: `MAX_PENDING_JOBS=50`; `queueDeferredUpload` returns `boolean`; three call sites respond 503 + `Retry-After: 30` and call `failDeferredDocument` on rejection; `createQueueFullResponse` helper added | Implemented Option 1 |

## Resources

- PR: #21 fix/bounded-deferred-queue
- File: `src/app/[locale]/api/documents/upload/route.ts:203-222`
- Related: todo 017 (original unbounded queue fix)
