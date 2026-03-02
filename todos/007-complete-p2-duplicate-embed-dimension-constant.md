---
status: complete
priority: p2
issue_id: "007"
tags: [code-review, dry, constants, architecture]
dependencies: []
---

# Duplicate MISTRAL_EMBED_DIMENSION Constant

## Problem Statement

`MISTRAL_EMBED_DIMENSION` is defined in both `Mistral.ts` and `Pinecone.ts`. This violates DRY and could cause inconsistencies if one is updated without the other.

**Why it matters:** If embedding dimension changes and only one file is updated, Pinecone index configuration will mismatch embeddings, causing silent failures.

## Findings

**Source:** Architecture Strategist Agent

**Locations:**
- `/src/libs/Mistral.ts` line 44: `const MISTRAL_EMBED_DIMENSION = 1024;`
- `/src/libs/Pinecone.ts` line 28: `const MISTRAL_EMBED_DIMENSION = 1024;`

## Proposed Solutions

### Option 1: Create Shared Config File (Recommended)
Extract to a single source of truth.

```typescript
// src/libs/EmbeddingConfig.ts
export const EMBEDDING_DIMENSION = 1024;
export const EMBEDDING_MODEL = 'mistral-embed';
```

**Pros:** Single source of truth, DRY compliant
**Cons:** One more file
**Effort:** Small
**Risk:** Low

### Option 2: Export from Mistral.ts
Have Pinecone import from Mistral.

**Pros:** No new file
**Cons:** Creates dependency from Pinecone to Mistral (coupling)
**Effort:** Small
**Risk:** Low

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

**Affected files:**
- `src/libs/Mistral.ts`
- `src/libs/Pinecone.ts`
- New: `src/libs/EmbeddingConfig.ts` (if Option 1)

## Acceptance Criteria

- [ ] Single definition of embedding dimension
- [ ] Both Mistral and Pinecone use the same constant
- [ ] No risk of mismatch on future changes

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Identified by Architecture Strategist |

## Resources

- PR: feat/url-processing branch
- Files: `src/libs/Mistral.ts:44`, `src/libs/Pinecone.ts:28`
