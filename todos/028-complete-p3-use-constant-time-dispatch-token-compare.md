---
status: complete
priority: p3
issue_id: "028"
tags: [code-review, security, api-hardening]
dependencies: []
---

# Dispatch token comparison is not constant-time

## Problem Statement

The internal dispatch endpoint compares bearer token strings with direct equality. This is functionally correct but not hardened against timing side-channel leakage.

**Why it matters:** For auth secrets, constant-time compare is a low-cost defense-in-depth improvement.

## Findings

- Token check uses `providedToken !== dispatchToken` in [dispatch route](/Users/piotrkreglicki/Projects/exercise-maker/src/app/api/internal/generation-jobs/dispatch/route.ts:40).
- Endpoint gates background worker execution; token validation is its primary security control.

## Proposed Solutions

### Option 1: Use constant-time comparison (Recommended)

**Approach:** Compare normalized byte arrays via `crypto.timingSafeEqual`.

**Pros:**
- Standard secret-comparison hardening.
- Minimal code change.

**Cons:**
- Slightly more verbose implementation.

**Effort:** Small

**Risk:** Low

---

### Option 2: Keep direct compare with additional request controls

**Approach:** Restrict endpoint by network layer (allowlist/internal ingress) and retain current check.

**Pros:**
- No code changes.

**Cons:**
- Still leaves app-layer comparison un-hardened.

**Effort:** Small

**Risk:** Medium

---

### Option 3: Replace static token with signed short-lived credentials

**Approach:** Use signed JWT/HMAC request signatures for dispatch authentication.

**Pros:**
- Stronger auth model and replay controls.

**Cons:**
- Higher complexity than needed for current scope.

**Effort:** Medium

**Risk:** Medium

## Recommended Action

Replace direct string equality with a constant-time comparison helper using `crypto.timingSafeEqual` over fixed-length digests.

## Technical Details

**Affected files:**
- `src/app/api/internal/generation-jobs/dispatch/route.ts`

## Resources

- PR: https://github.com/p-kreglicki/fictional-invention/pull/23
- Source: `src/app/api/internal/generation-jobs/dispatch/route.ts`

## Acceptance Criteria

- [x] Dispatch token comparison uses constant-time primitive
- [x] Invalid/missing token behavior remains unchanged (`401`)
- [x] Tests cover valid token, invalid token, and missing token paths

## Work Log

### 2026-03-05 - Initial discovery

**By:** Codex (ce-review)

**Actions:**
- Reviewed dispatch authentication guard implementation.
- Identified direct string comparison on secret material.
- Assessed low-cost hardening options.

**Learnings:**
- Route is already token-protected; constant-time comparison is an incremental hardening step.

### 2026-03-05 - Implementation completed

**By:** Codex

**Actions:**
- Added `compareDispatchTokens` in [`src/app/api/internal/generation-jobs/dispatch/route.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/app/api/internal/generation-jobs/dispatch/route.ts) using `crypto.timingSafeEqual`.
- Normalized token comparison through SHA-256 digests before constant-time equality to keep fixed-length inputs.
- Replaced direct `providedToken !== dispatchToken` guard with constant-time helper.
- Added test `returns 401 with invalid bearer token` in [`src/app/api/internal/generation-jobs/dispatch/route.test.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/app/api/internal/generation-jobs/dispatch/route.test.ts).
- Verified with `npm test -- src/app/api/internal/generation-jobs/dispatch/route.test.ts`, `npm run check:types`, and `npm run lint`.

**Learnings:**
- The hardening is small but materially improves secret-handling hygiene without changing endpoint behavior.
