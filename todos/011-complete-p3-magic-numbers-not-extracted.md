---
status: complete
priority: p3
issue_id: "011"
tags: [code-review, code-quality, constants]
dependencies: []
---

# Magic Numbers Not Extracted to Constants

## Problem Statement

Several magic numbers appear inline in the upload route instead of being defined as named constants:
- `100` character minimum for text uploads
- `200` character limit for titles (appears multiple times)
- `MAX_PDF_SIZE` is redefined instead of imported from `PdfConfig.ts`

**Why it matters:** Makes it hard to find and change limits consistently. Violates DRY principle.

## Findings

**Source:** TypeScript Reviewer, Pattern Recognition Specialist

**Location:** `/src/app/[locale]/api/documents/upload/route.ts`

```typescript
const MAX_PDF_SIZE = 10 * 1024 * 1024; // Line 18 - duplicates PdfConfig.PDF_MAX_SIZE_BYTES

if (sanitized.length < 100) {  // Line 272 - magic number

title.slice(0, 200)  // Lines 96, 200, 239, 281, 305 - repeated limit
```

## Proposed Solutions

### Option 1: Create DocumentConfig.ts (Recommended)
Extract to a config file similar to UrlConfig.ts.

```typescript
// src/libs/DocumentConfig.ts
export const MIN_TEXT_LENGTH = 100;
export const MAX_TITLE_LENGTH = 200;
// Import MAX_PDF_SIZE from PdfConfig
```

**Effort:** Small
**Risk:** Low

### Option 2: Add to Existing Config Files
Add constants to relevant existing config files.

**Effort:** Small
**Risk:** Low

## Acceptance Criteria

- [ ] No magic numbers in upload route
- [ ] All limits defined in config files
- [ ] Import `PDF_MAX_SIZE_BYTES` from PdfConfig instead of redefining

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Identified by TypeScript Reviewer |

## Resources

- File: `src/app/[locale]/api/documents/upload/route.ts`
- File: `src/libs/PdfConfig.ts`
