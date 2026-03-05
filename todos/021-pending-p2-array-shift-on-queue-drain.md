---
status: pending
priority: p2
issue_id: "021"
tags: [code-review, performance, data-structures]
dependencies: []
---

# Array.shift() on pendingJobs is O(n) on Every Job Drain

## Problem Statement

`runDeferredUpload`'s `finally` block calls `pendingJobs.shift()` to dequeue the next job. `Array.prototype.shift` removes the first element and slides all remaining elements left — O(n) per call. This runs on *every* job completion under normal operation.

**Why it matters:** At the current warning threshold of 20 items this is negligible. If todo 019 raises `MAX_PENDING_JOBS` to 50, each drain involves shifting 49 elements. More importantly, removing a known algorithmic inefficiency while the code is still being actively modified is cheap.

## Findings

**Source:** Performance Oracle Agent (PR #21 review)

**Location:** `src/app/[locale]/api/documents/upload/route.ts` line 174

```typescript
finally {
  activeJobs--;
  ...
  const next = pendingJobs.shift();  // O(n)
  if (next) {
    startDeferredJob(next);
  }
}
```

## Proposed Solutions

### Option 1: Head-pointer index (Recommended)

Track a `pendingHead` index alongside the array. Dequeue in O(1). Periodically compact when head grows large.

```typescript
let pendingHead = 0;
const pendingJobs: (DeferredUploadJob | undefined)[] = [];

// enqueue
pendingJobs.push(input);

// dequeue (in finally)
const next = pendingJobs[pendingHead];
if (next) {
  pendingJobs[pendingHead] = undefined;  // release reference
  pendingHead++;
  if (pendingHead > 100) {
    pendingJobs.splice(0, pendingHead);
    pendingHead = 0;
  }
  startDeferredJob(next);
}
```

**Pros:** O(1) dequeue; no new dependency; releases closure references eagerly.
**Cons:** Array grows before compaction (bounded by compaction threshold).
**Effort:** Small
**Risk:** Low

### Option 2: Use `denque` package

Replace the array with a proper double-ended queue. O(1) enqueue and dequeue with no compaction logic.

```typescript
import Denque from 'denque';
const pendingJobs = new Denque<DeferredUploadJob>();
pendingJobs.push(input);
const next = pendingJobs.shift();  // O(1)
```

**Pros:** Cleaner; well-tested; handles all edge cases.
**Cons:** Adds a dependency; `denque` is ~1 KB but requires `npm install`.
**Effort:** Trivial
**Risk:** Low

### Option 3: Leave as is

At bounded queue depth ≤ 50 (after todo 019), `shift()` on 49 items is microseconds. Not worth changing.

**Pros:** Zero change.
**Cons:** Leaves O(n) pattern in hot path; grows with any future limit increase.
**Effort:** None
**Risk:** Low

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

**Affected files:**
- `src/app/[locale]/api/documents/upload/route.ts`

**Performance profile:**

| Queue depth | shift() items moved | Cost |
|-------------|---------------------|------|
| 20          | 19                  | <1µs |
| 50          | 49                  | <1µs |
| 500         | 499                 | ~5µs |

## Acceptance Criteria

- [ ] `pendingJobs` dequeue is O(1)
- [ ] No array-level O(n) operation on the critical job-drain path
- [ ] Existing queue semantics (FIFO, ordered drain) preserved

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from PR #21 performance review | Performance Oracle identified O(n) dequeue |

## Resources

- PR: #21 fix/bounded-deferred-queue
- File: `src/app/[locale]/api/documents/upload/route.ts:174`
