---
status: complete
priority: p2
issue_id: "023"
tags: [code-review, api, validation, quality]
dependencies: []
---

# Return 422 for invalid generate JSON payload

The generate endpoint currently converts malformed client payloads into a generic internal server error.

## Problem Statement

`POST /api/exercises/generate` uses `request.json()` directly inside a broad `try/catch`. If JSON parsing fails, the handler returns `500 INTERNAL_ERROR` even though the client sent invalid input.

## Findings

- Request body is parsed with `await request.json()` in [`src/app/[locale]/api/exercises/generate/route.ts:74`](/Users/piotrkreglicki/Projects/exercise-maker/src/app/[locale]/api/exercises/generate/route.ts:74).
- Parse failures are caught by the outer catch and returned as `500` in [`src/app/[locale]/api/exercises/generate/route.ts:126`](/Users/piotrkreglicki/Projects/exercise-maker/src/app/[locale]/api/exercises/generate/route.ts:126).
- Current tests do not cover malformed JSON behavior in [`src/app/[locale]/api/exercises/generate/route.test.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/app/[locale]/api/exercises/generate/route.test.ts).

## Proposed Solutions

### Option 1: Add dedicated JSON parse handling (recommended)

**Approach:** Wrap `request.json()` in a local `try/catch` and return `422 INVALID_REQUEST` when payload is malformed.

**Pros:**
- Correct status code semantics
- Better client feedback and easier debugging

**Cons:**
- Small route logic change
- Requires one new test case

**Effort:** 30-60 minutes  
**Risk:** Low

---

### Option 2: Validate `content-type` strictly before parsing

**Approach:** Reject non-JSON content types with `415`, then parse and handle parse errors as `422`.

**Pros:**
- Stronger API contract
- More explicit client behavior

**Cons:**
- Can break existing callers with loose headers
- Slightly broader behavioral change

**Effort:** 1-2 hours  
**Risk:** Low

## Recommended Action

Implement Option 1 immediately and add a malformed JSON test. Consider Option 2 afterward if stricter API contracts are desired.

## Technical Details

**Affected files:**
- [`src/app/[locale]/api/exercises/generate/route.ts:74`](/Users/piotrkreglicki/Projects/exercise-maker/src/app/[locale]/api/exercises/generate/route.ts:74)
- [`src/app/[locale]/api/exercises/generate/route.ts:126`](/Users/piotrkreglicki/Projects/exercise-maker/src/app/[locale]/api/exercises/generate/route.ts:126)
- [`src/app/[locale]/api/exercises/generate/route.test.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/app/[locale]/api/exercises/generate/route.test.ts)

## Resources

- PR: [#23](https://github.com/p-kreglicki/fictional-invention/pull/23)

## Acceptance Criteria

- [x] Malformed JSON payload returns `422` with stable error code/message
- [x] Existing success/error paths remain unchanged
- [x] Route test suite includes malformed JSON case

## Work Log

### 2026-03-05 - Code review discovery

**By:** Codex

**Actions:**
- Reviewed request parsing and error mapping in generate route
- Mapped malformed JSON flow to current response status
- Confirmed test gap for parse-failure path

**Learnings:**
- Validation failures are already represented as `422`; malformed JSON should align with this behavior

### 2026-03-05 - Implementation completed

**By:** Codex

**Actions:**
- Added guarded request JSON parsing in [`route.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/app/[locale]/api/exercises/generate/route.ts)
- Returned `422 INVALID_REQUEST` on malformed JSON before enqueueing
- Added malformed JSON coverage in [`route.test.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/app/[locale]/api/exercises/generate/route.test.ts)
- Verified with `npm test -- 'src/app/[locale]/api/exercises/generate/route.test.ts'`, `npm run check:types`, and `npm run lint`

**Learnings:**
- Local parse guards preserve existing top-level error handling while improving API correctness for client failures
