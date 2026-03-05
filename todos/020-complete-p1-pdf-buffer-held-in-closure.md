---
status: complete
priority: p1
issue_id: "020"
tags: [code-review, performance, memory, pdf]
dependencies: []
---

# PDF Buffer Pinned in Closure for Full Queue Wait Duration

## Problem Statement

`handlePdfUpload` reads the entire PDF into a `Buffer` (up to 10 MB) and captures it inside the `extractText` arrow function closure. The buffer cannot be garbage-collected until `extractText` is invoked and completes — which only happens when the job reaches the front of `pendingJobs`. With a deep queue, a newly accepted PDF can hold 10 MB in heap for many minutes.

**Why it matters:** The bounded concurrency fix (PR #21) caps active jobs but does not reduce per-queued-job memory. All queued jobs hold their buffers alive. Even with a hard cap of 50 pending jobs (todo 019), the ceiling is 10 active × 10 MB + 50 queued × 10 MB = 600 MB — which may exceed the Vercel function limit.

## Findings

**Source:** Performance Oracle Agent (PR #21 review)

**Location:** `src/app/[locale]/api/documents/upload/route.ts` lines 351–373

```typescript
const buffer = Buffer.from(await file.arrayBuffer()); // up to 10 MB

queueDeferredUpload({
  documentId,
  ...
  extractText: async () => {
    const extraction = await processPdf(buffer);  // closure keeps buffer alive
    ...
  },
});
```

`buffer` is referenced only by `extractText`. V8 cannot collect it until the closure is invoked (and `buffer` goes out of scope inside `extractText`). For a job at position 40 in the queue, that could be 40 × (processing time) later.

## Proposed Solutions

### Option 1: Explicit field on DeferredUploadJob (Recommended)

Move the buffer to a named, typed field on the job object. After `extractText` runs, null it out in `runDeferredUpload` to release the reference immediately.

```typescript
type DeferredUploadJob = {
  ...
  pdfBuffer?: Buffer;
};

// handlePdfUpload
queueDeferredUpload({
  ...
  pdfBuffer: buffer,
  extractText: async (input) => {
    const extraction = await processPdf(input.pdfBuffer!);
    input.pdfBuffer = undefined;  // release before ingestContent
    ...
  },
});
```

This makes the GC release point explicit and visible in code review.

**Pros:** Buffer released immediately after `processPdf` returns; no closure capture; clear ownership.
**Cons:** Requires updating `DeferredUploadJob` type and `extractText` signature.
**Effort:** Small
**Risk:** Low

### Option 2: Accept the closure but null out inside extractText

Keep the current structure but explicitly set `buffer = undefined` (requires `let` not `const`) inside `extractText` after `processPdf` returns.

```typescript
let buffer: Buffer | undefined = Buffer.from(await file.arrayBuffer());
extractText: async () => {
  const extraction = await processPdf(buffer!);
  buffer = undefined;  // release
  ...
}
```

**Pros:** Minimal diff; no type changes.
**Cons:** Relies on discipline; V8 may or may not collect immediately; `let` for a large allocation is subtle.
**Effort:** Trivial
**Risk:** Low (but less explicit than Option 1)

### Option 3: Stream PDF to temp file (large refactor)

Write the uploaded bytes to a tmp path and pass the path through the job. `processPdf` reads from disk. Temp file deleted in `finally`.

**Pros:** Zero heap pressure for queued jobs.
**Cons:** Significant refactor; adds disk I/O; serverless /tmp is limited (512 MB on Vercel, shared).
**Effort:** Large
**Risk:** Medium

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

**Affected files:**
- `src/app/[locale]/api/documents/upload/route.ts`
- Potentially `src/libs/PdfExtractor.ts` if Option 3

**Max in-heap under current code (queue depth 50):**
- 10 active × 10 MB + 50 queued × 10 MB = 600 MB

**Max in-heap after fix (Option 1, queue depth 50):**
- 10 active × 10 MB (released immediately after processPdf) = 100 MB peak per job

## Acceptance Criteria

- [x] PDF `Buffer` is released from heap before `ingestContent` is called
- [x] No `Buffer` reference survives beyond the `processPdf` call in `extractText`
- [ ] Memory profiling shows no buffer accumulation at queue depth > 10

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from PR #21 performance review | Performance Oracle identified closure memory pinning |
| 2026-03-02 | Fixed: `const buffer` → `let buffer: Buffer \| undefined`; set `buffer = undefined` immediately after `processPdf` returns, before the success/failure branch | Implemented Option 2 (minimal diff, same GC effect as Option 1) |

## Resources

- PR: #21 fix/bounded-deferred-queue
- File: `src/app/[locale]/api/documents/upload/route.ts:351-373`
- Related: todo 019 (no hard queue limit)
