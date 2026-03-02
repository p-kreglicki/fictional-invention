---
status: complete
priority: p2
issue_id: "016"
tags: [code-review, security, rate-limiting, configuration]
dependencies: []
---

# Rate Limiter Silent Bypass Without ARCJET_KEY

## Problem Statement

When `ARCJET_KEY` is not configured, rate limiting is completely bypassed with no logging or warning. This is a silent security degradation that could go unnoticed in production.

**Why it matters:** An attacker could abuse upload endpoints without rate limits if the environment variable is accidentally omitted or misconfigured.

## Findings

**Source:** Security Sentinel Agent (PR #20 Review)

**Location:** `src/app/[locale]/api/documents/upload/route.ts` lines 186-206

```typescript
if (Env.ARCJET_KEY) {
  const decision = await uploadRateLimiter.protect(request, { userId: user.id });
  // ...rate limiting logic...
}
// If no ARCJET_KEY, rate limiting is silently skipped
```

**Risk:** Silent degradation of security - no indication that rate limiting is disabled.

## Proposed Solutions

### Option 1: Add Warning Log (Recommended)

Log a warning when rate limiting is disabled so operators are aware.

```typescript
if (!Env.ARCJET_KEY) {
  logger.warn('Rate limiting disabled - ARCJET_KEY not configured');
}
```

**Pros:** Simple, non-breaking, provides visibility
**Cons:** Only visible in logs
**Effort:** Small
**Risk:** Low

### Option 2: Require ARCJET_KEY in Production

Make ARCJET_KEY required when NODE_ENV=production.

**Pros:** Prevents accidental production deployment without rate limiting
**Cons:** Could break existing deployments
**Effort:** Small
**Risk:** Medium (breaking change)

### Option 3: Add Health Check Endpoint

Add an endpoint that reports security feature status.

**Pros:** Easy monitoring integration
**Cons:** More infrastructure to maintain
**Effort:** Medium
**Risk:** Low

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

**Affected files:**
- `src/app/[locale]/api/documents/upload/route.ts`
- `src/libs/Env.ts`

## Acceptance Criteria

- [x] Warning logged when ARCJET_KEY is not configured
- [x] Log message clearly states rate limiting is disabled
- [ ] Consider production-only requirement for ARCJET_KEY (deferred - not required for this fix)

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from PR #20 review | Security Sentinel identified silent bypass |
| 2026-03-02 | Added warning log when ARCJET_KEY not configured | Simple fix provides visibility into security degradation |

## Resources

- PR: #20 codex/p2-hardening-followup branch
- File: `src/app/[locale]/api/documents/upload/route.ts:186-206`
