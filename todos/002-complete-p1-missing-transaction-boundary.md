---
status: complete
priority: p1
issue_id: "002"
tags: [code-review, data-integrity, transaction, postgresql]
dependencies: []
---

# Missing Transaction Boundary for Chunk Storage

## Problem Statement

During `ingestContent`, the document update (setting status to `processing` and `chunkCount`) and chunk storage are separate database operations without a transaction boundary. If chunk insertion fails after document update, the document shows `chunkCount: N` but has 0 actual chunks.

**Why it matters:** Inconsistent database state where `chunkCount` does not match actual chunk records. This breaks data integrity and could cause downstream errors.

## Findings

**Source:** Data Integrity Guardian Agent

**Location:** `/src/libs/ContentIngestion.ts` lines 277-331

```typescript
// Step 2: Update reserved document - NOT IN TRANSACTION
await db.update(documentsSchema)
  .set({ status: 'processing', chunkCount: chunks.length, ... })
  .where(eq(documentsSchema.id, documentId));

// ... embedding generation (can fail) ...

// Step 4: Store chunks - NOT IN TRANSACTION
storedChunks = await storeChunksInDatabase(documentId, chunks);
```

**Failure Scenario:**
1. Document updated to `processing` with `chunkCount: 10`
2. Embedding generation succeeds
3. Database connection drops during chunk insertion
4. Document remains with `chunkCount: 10` but 0 actual chunks

## Proposed Solutions

### Option 1: Wrap in Single Transaction (Recommended)
Use Drizzle transaction to wrap document update and chunk insertion.

```typescript
await db.transaction(async (tx) => {
  await tx.update(documentsSchema).set({...});
  await tx.insert(chunksSchema).values(chunkRecords);
});
```

**Pros:** Simple, uses existing Drizzle patterns
**Cons:** Longer transaction duration
**Effort:** Small
**Risk:** Low

### Option 2: Update chunkCount After Chunk Insertion
Only set `chunkCount` after chunks are successfully inserted.

**Pros:** No long transaction
**Cons:** Requires code restructuring
**Effort:** Medium
**Risk:** Low

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

**Affected files:**
- `src/libs/ContentIngestion.ts`

**Components:**
- Content ingestion pipeline
- Document status tracking
- Chunk storage

## Acceptance Criteria

- [ ] Document update and chunk storage are atomic
- [ ] If chunk insertion fails, document is not left in inconsistent state
- [ ] `chunkCount` always matches actual chunk count in database
- [ ] Add test for partial insertion failure

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Identified by Data Integrity Guardian |

## Resources

- PR: feat/url-processing branch
- File: `src/libs/ContentIngestion.ts:277-331`
