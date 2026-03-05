---
status: complete
priority: p2
issue_id: "009"
tags: [code-review, typescript, type-safety, defensive-coding]
dependencies: []
---

# Non-Null Assertions Fragile in ContentIngestion

## Problem Statement

The code uses non-null assertions (`!`) to access array elements without verifying array lengths match. This assumes `embeddings`, `chunks`, and `storedChunks` all have the same length.

**Why it matters:** If arrays have different lengths due to a bug or edge case, the assertions will fail at runtime with unhelpful errors. Defensive checks would catch this early.

## Findings

**Source:** TypeScript Reviewer

**Location:** `/src/libs/ContentIngestion.ts` lines 340, 347

```typescript
const vectors = storedChunks.map((chunk, index) => ({
  id: chunk.pineconeId,
  values: embeddings[index]!,  // <- Non-null assertion
  metadata: {
    // ...
    text: chunks[index]!.text,  // <- Non-null assertion
  },
}));
```

**Also in:** `/src/app/[locale]/api/documents/upload/route.ts` lines 143, 241
```typescript
text: extraction.text!,  // Assumes text exists when success is true
```

## Proposed Solutions

### Option 1: Add Defensive Length Check (Recommended)
Verify array lengths match before mapping.

```typescript
if (embeddings.length !== storedChunks.length || chunks.length !== storedChunks.length) {
  logger.error('Array length mismatch', {
    embeddings: embeddings.length,
    storedChunks: storedChunks.length,
    chunks: chunks.length
  });
  throw new Error('Internal consistency error');
}
```

**Pros:** Catches bugs early, clear error message
**Cons:** Slightly more code
**Effort:** Small
**Risk:** Low

### Option 2: Use Discriminated Union for Extraction Result
Make `text` required when `success: true`.

```typescript
type UrlExtractionResult =
  | { success: true; text: string; title?: string; ... }
  | { success: false; error?: string; errorCode?: ... };
```

**Pros:** Type-level guarantee
**Cons:** Requires refactoring result types
**Effort:** Medium
**Risk:** Low

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

**Affected files:**
- `src/libs/ContentIngestion.ts`
- `src/app/[locale]/api/documents/upload/route.ts`
- `src/libs/UrlExtractor.ts` (if changing result type)

## Acceptance Criteria

- [ ] Array length mismatch is detected and logged before mapping
- [ ] Extraction result type guarantees `text` when `success: true`
- [ ] No runtime crashes from undefined array access

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Identified by TypeScript Reviewer |

## Resources

- PR: feat/url-processing branch
- File: `src/libs/ContentIngestion.ts:340-347`
