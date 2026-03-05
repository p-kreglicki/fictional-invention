---
status: complete
priority: p2
issue_id: "017"
tags: [code-review, performance, memory, scalability]
dependencies: []
---

# Unbounded Deferred Job Queue Memory Risk

## Problem Statement

The deferred upload processing pattern queues jobs without any limit on concurrent processing. Each PDF upload holds up to 10MB buffer in memory while waiting for the 31-second embedding rate limit. Under burst traffic, this can cause memory exhaustion.

**Why it matters:** With 50 concurrent PDF uploads, the process could hold 500MB+ in heap memory, potentially causing OOM errors.

## Findings

**Source:** Performance Oracle Agent (PR #20 Review)

**Location:** `src/app/[locale]/api/documents/upload/route.ts` lines 169-173

```typescript
function queueDeferredUpload(input: DeferredUploadJob) {
  setTimeout(() => {
    void runDeferredUpload(input);
  }, 0);
}
```

**Memory Impact per Upload:**
- PDF uploads: Up to 10MB buffer captured in closure
- Processing time: ~100s (4 embedding batches x 31s delay)
- No limit on concurrent jobs

**Projected Impact:**
| Concurrent Uploads | Memory Usage | Processing Time |
|-------------------|--------------|-----------------|
| 10 | 100MB | ~100s each |
| 50 | 500MB | ~100s each |
| 100 | 1GB+ | ~100s each |

## Proposed Solutions

### Option 1: Bound Concurrent Jobs (Recommended)

Limit the number of deferred jobs that can run concurrently.

```typescript
const MAX_CONCURRENT_DEFERRED_JOBS = 10;
let activeJobs = 0;
const pendingJobs: DeferredUploadJob[] = [];

function queueDeferredUpload(input: DeferredUploadJob) {
  if (activeJobs >= MAX_CONCURRENT_DEFERRED_JOBS) {
    pendingJobs.push(input);
    return;
  }

  activeJobs++;
  setTimeout(async () => {
    try {
      await runDeferredUpload(input);
    } finally {
      activeJobs--;
      const next = pendingJobs.shift();
      if (next) queueDeferredUpload(next);
    }
  }, 0);
}
```

**Pros:** Simple, bounded memory, preserves processing order
**Cons:** Adds queue management complexity
**Effort:** Medium
**Risk:** Low

### Option 2: Stream PDF to Temp File

Write PDF buffer to temporary file instead of holding in memory.

**Pros:** Minimal memory footprint
**Cons:** Adds I/O overhead, requires cleanup
**Effort:** Medium
**Risk:** Low

### Option 3: Use Proper Job Queue (BullMQ)

Replace setTimeout with a proper job queue for persistence and retry support.

**Pros:** Production-grade, observable, retryable
**Cons:** Infrastructure dependency
**Effort:** Large
**Risk:** Medium

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

**Affected files:**
- `src/app/[locale]/api/documents/upload/route.ts`

**Components:**
- Deferred upload processing
- PDF buffer handling
- Memory management

## Acceptance Criteria

- [x] Maximum concurrent deferred jobs is bounded
- [x] Memory usage stays predictable under burst traffic
- [x] Jobs are not lost when queue is full (queue them)
- [x] Add monitoring for active/queued job counts

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from PR #20 review | Performance Oracle identified memory risk |
| 2026-03-02 | Implemented bounded job queue | Added MAX_CONCURRENT_DEFERRED_JOBS=10, pending queue with warning at 20+ jobs |

## Resources

- PR: #20 codex/p2-hardening-followup branch
- File: `src/app/[locale]/api/documents/upload/route.ts:169-173`
