---
status: complete
priority: p2
issue_id: "038"
tags: [code-review, security, rate-limiting]
dependencies: []
---

# Rate Limiting Disabled Without ARCJET_KEY

## Problem Statement

When `ARCJET_KEY` is not configured, the submission endpoint operates without rate limiting. This is only logged as a warning, allowing unlimited submissions which could lead to abuse.

## Findings

**Location:** `/src/app/[locale]/api/responses/submit/route.ts` (lines 96-98)

```typescript
} else {
  logger.warn('Response rate limiting disabled - ARCJET_KEY not configured');
}
```

**Potential Impact:**
- Denial of service through submission flooding
- Increased LLM API costs from unlimited evaluation requests
- Database growth from unbounded response records
- Production deployment without rate limiting if env var is missed

## Proposed Solutions

### Option A: Fail Closed in Production (Recommended)

Require rate limiting in production environments. Reject requests if ARCJET_KEY is not configured in production.

```typescript
if (!Env.ARCJET_KEY) {
  if (process.env.NODE_ENV === 'production') {
    logger.error('ARCJET_KEY required in production');
    return NextResponse.json(
      { error: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' },
      { status: 503 }
    );
  }
  logger.warn('Rate limiting disabled in development');
}
```

**Pros:**
- Prevents production without rate limiting
- Clear failure mode
- Development still works without key

**Cons:**
- Could cause outages if key expires/rotates incorrectly

**Effort:** Small (30 minutes)
**Risk:** Low

### Option B: In-Memory Fallback Rate Limiter

Implement a simple in-memory rate limiter when Arcjet is unavailable.

```typescript
const fallbackLimiter = new Map<string, { count: number; resetAt: number }>();

function checkFallbackRateLimit(userId: string): boolean {
  const now = Date.now();
  const record = fallbackLimiter.get(userId);
  // ... implement simple sliding window
}
```

**Pros:**
- Always has some protection
- Works without external service

**Cons:**
- Not distributed (per-instance only)
- Memory management complexity
- Different behavior from Arcjet

**Effort:** Medium (2-4 hours)
**Risk:** Medium

### Option C: Environment Validation at Startup

Add ARCJET_KEY to required environment variables via Env.ts.

**Pros:**
- Fails fast at startup
- Clear configuration requirement

**Cons:**
- Breaks local development without key
- Doesn't allow graceful degradation

**Effort:** Small (15 minutes)
**Risk:** Medium (may break workflows)

## Recommended Action

Implemented Option A. The upload, generation, and submission routes now fail closed with `503 SERVICE_UNAVAILABLE` in production when `ARCJET_KEY` is missing, while development still warns and continues without the key.

## Technical Details

**Affected Files:**
- `/src/app/[locale]/api/responses/submit/route.ts`
- `/src/app/[locale]/api/exercises/generate/route.ts`
- `/src/app/[locale]/api/documents/upload/route.ts`
- `/src/libs/ArcjetConfig.ts`
- `/README.md`

## Acceptance Criteria

- [x] Production requests fail gracefully without ARCJET_KEY
- [x] Development still works without ARCJET_KEY
- [x] Clear error logging when rate limiting is unavailable
- [x] Documentation updated about ARCJET_KEY requirement

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-06 | Created during PR #26 code review | Identified by security-sentinel agent |
| 2026-03-06 | Added shared Arcjet misconfiguration handling for upload, generation, and submission routes; updated README; added production-missing-key regression tests for all three routes | Fail-closed production behavior removes the abuse/cost risk without forcing local development to provision Arcjet |

## Resources

- PR #26: https://github.com/p-kreglicki/fictional-invention/pull/26
- Arcjet Documentation: https://docs.arcjet.com/
