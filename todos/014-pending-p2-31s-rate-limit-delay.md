---
status: completed
priority: p2
issue_id: "014"
tags: [code-review, performance, user-experience, embeddings]
dependencies: []
---

# 31-Second Rate Limit Delay Creates Unacceptable UX

## Problem Statement

The Mistral embedding API has a hardcoded 31-second delay between batches. For documents with 50 chunks (4 batches), this adds 93 seconds of pure waiting time.

**Why it matters:** Users experience 100+ second upload times for larger documents. Unacceptable for production UX.

## Findings

**Source:** Performance Oracle Agent

**Location:** `/src/libs/Mistral.ts` lines 121-125

```typescript
if (i + MAX_BATCH_SIZE < texts.length) {
  logger.debug('Rate limiting: waiting 31s before next batch');
  await new Promise(resolve => setTimeout(resolve, 31000));
}
```

**Impact by document size:**
| Chunks | Batches | Rate Limit Wait | Total Time |
|--------|---------|-----------------|------------|
| 16     | 1       | 0s              | ~2s        |
| 50     | 4       | 93s             | ~100s      |

## Proposed Solutions

### Option 1: Background Job Processing (Recommended)
Move embedding generation to a background job queue.

```
POST /upload -> Create document with status 'queued' -> Return 202 Accepted
Background worker -> Process embeddings -> Update status to 'ready'
GET /documents/:id -> Poll for completion
```

**Pros:** Best UX, scalable
**Cons:** Requires job queue infrastructure
**Effort:** Large
**Risk:** Medium

### Option 2: Adaptive Rate Limiting
Implement token bucket algorithm, only wait when actually rate limited.

**Pros:** Faster when quota available
**Cons:** Still synchronous, still slow when limited
**Effort:** Medium
**Risk:** Low

### Option 3: Upgrade API Tier
Use paid Mistral tier with higher rate limits.

**Pros:** Simple
**Cons:** Cost, still has limits
**Effort:** Small (config change)
**Risk:** Low

### Option 4: Make Rate Limit Configurable
Add environment variable for rate limit delay.

```typescript
const RATE_LIMIT_MS = Env.MISTRAL_RATE_LIMIT_MS ?? 31000;
```

**Pros:** Easy to tune per environment
**Cons:** Still synchronous
**Effort:** Small
**Risk:** Low

## Recommended Action

Implemented async upload processing with `202 Accepted` responses and background ingestion.
Uploads now reserve a document slot immediately, return without waiting for embedding batches, and rely on existing document status polling (`GET /api/documents/:id`) for completion tracking.

## Technical Details

**Affected files:**
- `src/app/[locale]/api/documents/upload/route.ts`
- `src/libs/ContentIngestion.ts`
- `src/app/[locale]/api/documents/upload/route.test.ts`

## Acceptance Criteria

- [x] Document upload returns quickly (< 10s for typical documents)
- [x] Rate limiting doesn't block user requests
- [x] Status can be polled if processing is async

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Identified by Performance Oracle |
| 2026-03-02 | Switched uploads to deferred background ingestion and `202 Accepted` responses | Removes request-path wait on 31s embedding batch delay while preserving status polling |

## Resources

- PR: https://github.com/p-kreglicki/fictional-invention/pull/20
- File: `src/libs/Mistral.ts:121-125`
