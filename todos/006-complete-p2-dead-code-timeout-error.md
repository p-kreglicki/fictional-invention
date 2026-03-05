---
status: complete
priority: p2
issue_id: "006"
tags: [code-review, dead-code, cleanup, typescript]
dependencies: []
---

# Dead Code: TimeoutError Class Never Used

## Problem Statement

The `TimeoutError` class is defined in `UrlExtractor.ts` but is never instantiated. The code checks for `error.name === 'AbortError'` from the AbortController instead. The `instanceof TimeoutError` check is dead code.

**Why it matters:** Dead code adds confusion and maintenance burden. Developers may think this error path is active when it's not.

## Findings

**Source:** TypeScript Reviewer, Simplicity Reviewer, Pattern Recognition Specialist

**Location:** `/src/libs/UrlExtractor.ts` lines 41-46, 270-276

```typescript
// Lines 41-46 - Never instantiated
class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

// Lines 270-276 - Dead code path (TimeoutError is never thrown)
if (error instanceof TimeoutError) {
  return {
    success: false,
    error: 'The URL took too long to respond.',
    errorCode: 'TIMEOUT',
  };
}
```

**Note:** Similar `TimeoutError` class exists in `PdfExtractor.ts` - this is also duplicated code.

## Proposed Solutions

### Option 1: Remove Dead Code (Recommended)
Remove the `TimeoutError` class and the `instanceof TimeoutError` check.

**Pros:** Cleaner code, no confusion
**Cons:** None
**Effort:** Small
**Risk:** Low

### Option 2: Extract to Shared Module and Use
If timeout error handling is needed elsewhere, extract to shared `Errors.ts` and actually use it.

**Pros:** Proper error handling, reusable
**Cons:** More work if not needed
**Effort:** Medium
**Risk:** Low

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

**Affected files:**
- `src/libs/UrlExtractor.ts`
- `src/libs/PdfExtractor.ts` (also has duplicate TimeoutError)

## Acceptance Criteria

- [ ] Remove `TimeoutError` class from UrlExtractor.ts
- [ ] Remove `instanceof TimeoutError` check from UrlExtractor.ts
- [ ] Consider consolidating error classes if needed elsewhere
- [ ] All tests pass

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Identified by multiple reviewers |

## Resources

- PR: feat/url-processing branch
- File: `src/libs/UrlExtractor.ts:41-46, 270-276`
