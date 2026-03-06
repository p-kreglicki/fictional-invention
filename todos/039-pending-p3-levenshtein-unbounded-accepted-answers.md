---
status: pending
priority: p3
issue_id: "039"
tags: [code-review, performance, security]
dependencies: []
---

# Levenshtein Distance Without Bounds Check on Accepted Answers

## Problem Statement

The Levenshtein distance function has O(m*n) time complexity. While user answers are bounded to 120 characters, accepted answers from the database are not validated before comparison. A malformed exercise with an excessively long accepted answer could cause performance issues.

## Findings

**Location:** `/src/libs/AnswerEvaluation.ts` (lines 115-137)

```typescript
function isFillGapNearMatch(input: {
  acceptedAnswers: string[];
  userAnswer: string;
}) {
  const normalizedUserAnswer = normalizeComparableText(input.userAnswer);

  // User answer is bounded...
  if (normalizedUserAnswer.length < 2 || normalizedUserAnswer.length > 120) {
    return false;
  }

  return input.acceptedAnswers.some((answer) => {
    const normalizedAccepted = normalizeComparableText(answer);
    // ...but accepted answer length is NOT checked
    return levenshteinDistance(normalizedUserAnswer, normalizedAccepted) <= 2;
  });
}
```

**Potential Impact:** An exercise with a 10,000+ character accepted answer would cause:
- Memory allocation: O(10,000) array elements per comparison
- Time: O(120 * 10,000) = 1.2M iterations per comparison
- With multiple accepted answers, this compounds further

This is a real performance-hardening concern, but the current blast radius is constrained because
accepted answers are capped to a small count and originate from server-controlled exercise generation.

## Proposed Solutions

### Option A: Length Validation Before Comparison (Recommended)

Add length validation for accepted answers before Levenshtein comparison.

```typescript
return input.acceptedAnswers.some((answer) => {
  const normalizedAccepted = normalizeComparableText(answer);

  // Skip comparison for disproportionately long accepted answers
  if (normalizedAccepted.length > normalizedUserAnswer.length * 3) {
    return false;
  }
  if (normalizedAccepted.length > 120) {
    return false;
  }

  return levenshteinDistance(normalizedUserAnswer, normalizedAccepted) <= 2;
});
```

**Pros:**
- Simple defensive check
- No database changes needed
- Protects against malformed data

**Cons:**
- Could reject legitimate long answers (unlikely for fill-gap)

**Effort:** Small (15 minutes)
**Risk:** Low

### Option B: Database Constraint

Add CHECK constraint on exercise data length at database level.

**Pros:**
- Prevents bad data at source
- Defense in depth

**Cons:**
- Requires migration
- Doesn't protect against existing data

**Effort:** Small (30 minutes)
**Risk:** Low

### Option C: Early Termination in Levenshtein

Modify Levenshtein function to terminate early if distance exceeds threshold.

```typescript
function levenshteinDistance(left: string, right: string, maxDistance?: number) {
  // If lengths differ by more than maxDistance, return early
  if (Math.abs(left.length - right.length) > (maxDistance ?? Infinity)) {
    return Infinity;
  }
  // ... rest of algorithm
}
```

**Pros:**
- Optimizes algorithm itself
- Useful for other use cases

**Cons:**
- More complex implementation
- Requires careful testing

**Effort:** Medium (1-2 hours)
**Risk:** Medium

## Recommended Action

Implement Option A as immediate fix. It's simple, defensive, and handles the specific risk.

## Technical Details

**Affected Files:**
- `/src/libs/AnswerEvaluation.ts`

## Acceptance Criteria

- [ ] Accepted answers over reasonable length are skipped
- [ ] Performance remains consistent regardless of stored answer length
- [ ] Unit test added for edge case with long accepted answer

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-06 | Created during PR #26 code review | Identified by performance-oracle agent |
| 2026-03-06 | Re-evaluated severity after reviewing schema bounds and data origin | Keep as follow-up work, but downgrade to p3 because accepted answers are capped at 5 and are not currently user-authored |

## Resources

- PR #26: https://github.com/p-kreglicki/fictional-invention/pull/26
