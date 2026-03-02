---
status: complete
priority: p2
issue_id: "004"
tags: [code-review, security, rate-limiting, api]
dependencies: []
---

# No API-Level Rate Limiting on Upload Endpoints

## Problem Statement

The document upload API lacks rate limiting. While there's a per-user quota of 50 documents, attackers could:
- Rapidly create/delete documents to abuse external API quotas (Mistral embeddings)
- Perform resource exhaustion through rapid URL fetches
- Trigger excessive DNS lookups

**Why it matters:** Resource exhaustion, increased costs, potential service degradation.

## Findings

**Source:** Security Sentinel Agent

**Location:** `/src/app/[locale]/api/documents/upload/route.ts`

No rate limiting middleware or checks are present on the upload endpoint.

## Proposed Solutions

### Option 1: Vercel Rate Limiting (Recommended for Vercel deployments)
Use Vercel's built-in rate limiting with Edge Config.

**Pros:** Native integration, no extra infrastructure
**Cons:** Vercel-specific
**Effort:** Small
**Risk:** Low

### Option 2: Redis-Based Rate Limiter
Implement token bucket or sliding window rate limiting with Redis.

**Pros:** Flexible, works anywhere
**Cons:** Requires Redis infrastructure
**Effort:** Medium
**Risk:** Low

### Option 3: In-Memory Rate Limiting (Middleware)
Use `express-rate-limit` style middleware with in-memory store.

**Pros:** Simple, no external dependencies
**Cons:** Doesn't work well with serverless (no shared state)
**Effort:** Small
**Risk:** Medium (ineffective in serverless)

## Recommended Action

<!-- To be filled during triage -->

## Technical Details

**Affected files:**
- `src/app/[locale]/api/documents/upload/route.ts`
- New middleware file (if applicable)

**Suggested limits:**
- 10 uploads per minute per user
- 100 uploads per hour per user
- 5 concurrent uploads per user

## Acceptance Criteria

- [ ] Rate limiting applied to upload endpoints
- [ ] Clear error response (429) when limit exceeded
- [ ] Rate limit headers exposed (X-RateLimit-*)
- [ ] Limits are configurable via environment

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-02 | Created from code review | Identified by Security Sentinel |

## Resources

- PR: feat/url-processing branch
- File: `src/app/[locale]/api/documents/upload/route.ts`
