---
status: pending
priority: p3
issue_id: "018"
tags: [code-review, performance, url-extraction, scalability]
dependencies: []
---

# Semaphore Queue Unbounded Growth Risk

## Problem Statement

The URL fetch semaphore has no maximum queue size or acquire timeout. Under sustained high load with slow external URLs, the queue can grow indefinitely.

**Why it matters:** With 5 concurrent fetches and 10s timeout each, throughput is 0.5 URLs/second. Requests above this rate accumulate in an unbounded queue.

## Findings

**Source:** Performance Oracle Agent (PR #20 Review)

**Location:** `src/libs/UrlExtractor.ts` lines 57-93

```typescript
class Semaphore {
  private available: number;
  private queue: Array<() => void> = [];  // No size limit

  async acquire() {
    if (this.available > 0) {
      this.available -= 1;
      return;
    }
    // No timeout, no queue limit
    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }
}
```

**Projected Impact:**
| Concurrent Requests | Queue Size | Memory |
|---------------------|------------|--------|
| 100 | 95 | ~100KB |
| 1000 | 995 | ~1MB |

## Proposed Solutions

### Option 1: Add Queue Limits and Timeout (Recommended)

Bound the queue and add timeout to prevent indefinite waiting.

```typescript
class BoundedSemaphore {
  private static readonly MAX_QUEUE_SIZE = 100;
  private static readonly ACQUIRE_TIMEOUT_MS = 30000;

  async acquire(): Promise<void> {
    if (this.queue.length >= BoundedSemaphore.MAX_QUEUE_SIZE) {
      throw new Error('Too many pending requests');
    }
    // Add timeout to acquire promise
  }
}
```

**Pros:** Fail-fast under extreme load, predictable behavior
**Cons:** Requires error handling for queue full case
**Effort:** Small
**Risk:** Low

### Option 2: Use async-sema Library

Replace custom implementation with battle-tested library.

**Pros:** Well-tested, feature-rich
**Cons:** Adds dependency
**Effort:** Small
**Risk:** Low

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

**Affected files:**
- `src/libs/UrlExtractor.ts`

## Acceptance Criteria

- [ ] Semaphore queue has maximum size
- [ ] Acquire has timeout to prevent indefinite waiting
- [ ] Error case handled when queue is full

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from PR #20 review | Performance Oracle identified queue risk |

## Resources

- PR: #20 codex/p2-hardening-followup branch
- File: `src/libs/UrlExtractor.ts:57-93`
