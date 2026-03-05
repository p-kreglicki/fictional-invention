---
status: complete
priority: p1
issue_id: "003"
tags: [code-review, data-integrity, pinecone, user-experience]
dependencies: []
---

# Silent Pinecone Failure Marks Document as Ready

## Problem Statement

When Pinecone vector upsert fails, the error is caught and logged but the document is still marked as `ready`. Users believe their document is searchable, but vector search will never find it.

**Why it matters:** Violates principle of least surprise. Users think document is ready and searchable, but it's not indexed. Silent data loss from user perspective.

## Findings

**Source:** Data Integrity Guardian Agent

**Location:** `/src/libs/ContentIngestion.ts` lines 351-363

```typescript
try {
  await upsertToPinecone(vectors);
} catch (error) {
  logger.error('Pinecone upsert failed', { documentId, error });
  // Don't fail the entire operation - chunks are in DB, just not searchable
  logger.warn('Document stored but vector indexing failed', { documentId });
}

// Step 6: Update document status to ready  <-- Proceeds despite failure!
await updateDocumentStatus(documentId, 'ready');
```

## Proposed Solutions

### Option 1: Add `indexingFailed` Flag (Recommended)
Mark document as `ready` but add a boolean flag indicating indexing status.

```typescript
await db.update(documentsSchema).set({
  status: 'ready',
  searchable: false,  // New column
});
```

**Pros:** Preserves document, user sees it exists, can retry indexing
**Cons:** Requires schema migration, UI changes to show status
**Effort:** Medium
**Risk:** Low

### Option 2: New Status `partially_ready`
Add a new document status for this state.

**Pros:** Clear status distinction
**Cons:** Requires enum change, migration, UI updates
**Effort:** Medium
**Risk:** Low

### Option 3: Fail the Entire Operation
Treat Pinecone failure as ingestion failure.

**Pros:** Simple, consistent behavior
**Cons:** User loses document even though content is extracted
**Effort:** Small
**Risk:** Medium (worse UX if Pinecone has temporary issues)

### Option 4: Implement Retry Queue
Queue failed Pinecone upserts for background retry.

**Pros:** Best UX, handles transient failures
**Cons:** Requires job queue infrastructure
**Effort:** Large
**Risk:** Low

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

**Affected files:**
- `src/libs/ContentIngestion.ts`
- `src/models/Schema.ts` (if adding column)
- Migration file (new)

**Components:**
- Content ingestion pipeline
- Document status tracking
- Pinecone integration

## Acceptance Criteria

- [ ] Document status clearly indicates if vector indexing failed
- [ ] User can see which documents are/aren't searchable
- [ ] API response includes searchability status
- [ ] Consider retry mechanism for failed indexing

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Identified by Data Integrity Guardian |

## Resources

- PR: feat/url-processing branch
- File: `src/libs/ContentIngestion.ts:351-363`
