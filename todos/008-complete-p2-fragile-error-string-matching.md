---
status: complete
priority: p2
issue_id: "008"
tags: [code-review, error-handling, typescript, maintainability]
dependencies: []
---

# Fragile Error Checking via String Matching

## Problem Statement

API routes check for authentication errors by matching against error message strings: `error.message.includes('Authentication')`. This is fragile - if the error message changes, the check breaks silently.

**Why it matters:** A change to error message text in one place breaks error handling in another. Silent failures in auth error detection could leak information or cause wrong HTTP status codes.

## Findings

**Source:** Architecture Strategist Agent, TypeScript Reviewer

**Locations:**
- `/src/app/[locale]/api/documents/route.ts` line 51
- `/src/app/[locale]/api/documents/upload/route.ts` line 48
- `/src/app/[locale]/api/documents/[id]/route.ts` lines 60, 98

```typescript
if (error instanceof Error && error.message.includes('Authentication')) {
  return NextResponse.json(
    { error: 'UNAUTHORIZED', message: 'Authentication required' },
    { status: 401 },
  );
}
```

## Proposed Solutions

### Option 1: Create Typed Error Classes (Recommended)
Define custom error classes for different error types.

```typescript
// src/libs/Errors.ts
export class AuthenticationError extends Error {
  readonly code = 'UNAUTHORIZED' as const;
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

// In route handlers:
if (error instanceof AuthenticationError) {
  return NextResponse.json({ error: error.code, message: error.message }, { status: 401 });
}
```

**Pros:** Type-safe, refactor-friendly, IDE support
**Cons:** More boilerplate
**Effort:** Medium
**Risk:** Low

### Option 2: Error Code Property
Add a `code` property to errors thrown by auth functions.

**Pros:** Less invasive
**Cons:** Still requires runtime checks
**Effort:** Small
**Risk:** Low

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

**Affected files:**
- `src/libs/Auth.ts` (throw typed errors)
- `src/app/[locale]/api/documents/*.ts` (catch typed errors)
- New: `src/libs/Errors.ts`

## Acceptance Criteria

- [ ] Authentication errors use typed error class
- [ ] Route handlers use `instanceof` checks
- [ ] No string matching for error detection
- [ ] All auth error scenarios still handled correctly

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Identified by Architecture Strategist |

## Resources

- PR: feat/url-processing branch
- Pattern: https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates
