---
status: complete
priority: p2
issue_id: "005"
tags: [code-review, security, timing-attack, authorization]
dependencies: []
---

# Timing Attack Vulnerability in Document Fetch

## Problem Statement

The document GET endpoint fetches the document first, then checks ownership. This leaks timing information about whether a document exists, even if the user doesn't own it.

**Why it matters:** Attackers can enumerate valid document IDs by measuring response times. Documents that exist but aren't owned return slower than non-existent documents.

## Findings

**Source:** Architecture Strategist Agent

**Location:** `/src/app/[locale]/api/documents/[id]/route.ts` lines 26-43

```typescript
// Current (leaks timing)
const document = await db.query.documentsSchema.findFirst({
  where: eq(documentsSchema.id, id),
});

if (!document) {
  return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
}

if (document.userId !== user.id) {
  return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });  // Different status!
}
```

**Attack scenario:**
- 404 response: Document doesn't exist
- 403 response: Document exists but user doesn't own it
- This distinction allows document ID enumeration

## Proposed Solutions

### Option 1: Combined Query with User Filter (Recommended)
Query with both document ID and user ID in WHERE clause.

```typescript
const document = await db.query.documentsSchema.findFirst({
  where: and(
    eq(documentsSchema.id, id),
    eq(documentsSchema.userId, user.id),
  ),
});

if (!document) {
  return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
}
```

**Pros:** Single query, no timing leak, simpler code
**Cons:** None
**Effort:** Small
**Risk:** Low

### Option 2: Constant-Time Response
Always return 404 for both not-found and forbidden.

**Pros:** No information leak
**Cons:** Less informative for legitimate users
**Effort:** Small
**Risk:** Low

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

**Affected files:**
- `src/app/[locale]/api/documents/[id]/route.ts`

**Note:** The DELETE endpoint in the same file uses `deleteDocument()` which already combines the check correctly.

## Acceptance Criteria

- [ ] GET endpoint uses combined query with userId
- [ ] Same 404 response for non-existent and forbidden documents
- [ ] No timing difference between the two cases
- [ ] DELETE endpoint verified to have same pattern

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Identified by Architecture Strategist |

## Resources

- PR: feat/url-processing branch
- File: `src/app/[locale]/api/documents/[id]/route.ts:26-43`
