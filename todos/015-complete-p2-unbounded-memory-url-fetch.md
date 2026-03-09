---
status: complete
priority: p2
issue_id: "015"
tags: [code-review, performance, memory, security]
dependencies: []
---

# Unbounded Memory Accumulation in URL Streaming

## Problem Statement

The URL fetching code accumulates all response chunks in memory before processing. With the 5MB limit per request and no concurrency limit, 10 concurrent URL fetches could use 100MB+ of memory.

**Why it matters:** Memory exhaustion risk under concurrent load. Could cause OOM crashes or degraded performance.

## Findings

**Source:** Performance Oracle Agent

**Location:** `/src/libs/UrlExtractor.ts` lines 143-159

```typescript
const chunks: Uint8Array[] = [];
let totalSize = 0;

while (true) {
  const { done, value } = await reader.read();
  // ... accumulates in chunks array
  chunks.push(value);
}

// Combine chunks - creates another copy
const combined = new Uint8Array(totalSize);
```

**Memory usage per request:**
- Raw chunks: up to 5MB
- Combined buffer: up to 5MB
- Total per request: ~10MB
- With 10 concurrent: ~100MB

## Proposed Solutions

### Option 1: Add Concurrency Limit (Recommended)
Implement semaphore to limit concurrent URL fetches.

```typescript
const fetchSemaphore = new Semaphore(5); // Max 5 concurrent fetches

export async function extractUrlContent(url: string) {
  return fetchSemaphore.runExclusive(async () => {
    // ... existing logic
  });
}
```

**Pros:** Simple, limits memory exposure
**Cons:** Adds queuing, may slow down concurrent requests
**Effort:** Small
**Risk:** Low

### Option 2: Streaming HTML Parser
Use a streaming HTML parser instead of accumulating full response.

**Pros:** Minimal memory footprint
**Cons:** Major refactor, Readability may not support streaming
**Effort:** Large
**Risk:** High

### Option 3: Reduce Max Content Size
Lower `URL_MAX_CONTENT_BYTES` from 5MB to 2MB.

**Pros:** Immediate impact
**Cons:** May reject legitimate large pages
**Effort:** Small
**Risk:** Low

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

**Affected files:**
- `src/libs/UrlExtractor.ts`
- `src/libs/UrlConfig.ts` (if changing limits)

## Acceptance Criteria

- [ ] Maximum concurrent URL fetches is limited
- [ ] Memory usage under load is bounded and predictable
- [ ] Add memory pressure tests

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Identified by Performance Oracle |

## Resources

- PR: feat/url-processing branch
- File: `src/libs/UrlExtractor.ts:143-159`
