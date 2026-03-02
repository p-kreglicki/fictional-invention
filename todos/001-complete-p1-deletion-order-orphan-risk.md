---
status: complete
priority: p1
issue_id: "001"
tags: [code-review, data-integrity, pinecone, postgresql]
dependencies: []
---

# Deletion Order Creates Orphan Risk in Pinecone

## Problem Statement

The `deleteDocument` function deletes vectors from Pinecone FIRST, then deletes the document from PostgreSQL. If the PostgreSQL deletion fails after Pinecone succeeds, vectors are permanently lost but the document remains visible to the user.

**Why it matters:** Users see their document still exists, but search functionality is broken because the vectors are gone. This is irrecoverable data corruption.

## Findings

**Source:** Data Integrity Guardian Agent

**Location:** `/src/libs/ContentIngestion.ts` lines 396-429

```typescript
// Delete from Pinecone FIRST
if (chunks.length > 0) {
  const index = getNamespacedIndex();
  const pineconeIds = chunks.map(c => c.pineconeId);
  await index.deleteMany(pineconeIds);  // <-- Succeeds
}

// Delete document - if this fails, vectors are gone
await db.delete(documentsSchema).where(eq(documentsSchema.id, documentId));  // <-- Failure = orphan
```

## Proposed Solutions

### Option 1: Reverse Deletion Order (Recommended)
Delete PostgreSQL first, then Pinecone. If Pinecone fails, orphaned vectors are benign (ignored since documentId no longer exists).

**Pros:** Simple fix, minimal code change
**Cons:** Orphaned vectors in Pinecone (benign, can be cleaned up)
**Effort:** Small
**Risk:** Low

### Option 2: Soft Delete with Background Cleanup
Mark document as `deleting` status, then background job handles actual deletion.

**Pros:** Most robust, allows retries
**Cons:** More complex, requires background job infrastructure
**Effort:** Large
**Risk:** Medium

### Option 3: Two-Phase Delete with Compensation
Delete Pinecone, if PostgreSQL fails, re-insert vectors to Pinecone.

**Pros:** Full atomicity
**Cons:** Complex, requires storing vector data temporarily
**Effort:** Large
**Risk:** High (compensation can also fail)

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

**Affected files:**
- `src/libs/ContentIngestion.ts`

**Components:**
- Document deletion flow
- Pinecone vector storage
- PostgreSQL document storage

## Acceptance Criteria

- [ ] PostgreSQL deletion happens before Pinecone deletion
- [ ] If Pinecone deletion fails, document is already removed from PostgreSQL
- [ ] Orphaned vectors in Pinecone do not affect search results (documentId filter)
- [ ] Existing tests pass
- [ ] Add test for partial deletion failure scenario

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Identified by Data Integrity Guardian |

## Resources

- PR: feat/url-processing branch
- File: `src/libs/ContentIngestion.ts:396-429`
