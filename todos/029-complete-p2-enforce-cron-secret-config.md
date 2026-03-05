---
status: complete
priority: p2
issue_id: "029"
tags: [code-review, reliability, operations, configuration]
dependencies: []
---

# Durable dispatch still fails silently when cron auth is not configured

## Problem Statement

PR #24 makes exercise generation durable only if deployment sets `CRON_SECRET` (or `GENERATION_DISPATCH_TOKEN`) correctly. The new env var is optional, and the dispatch route simply returns `401` when no token is configured. A production deploy that misses this env var will still accept generation requests, but the scheduled worker path will never authenticate and queued jobs will continue to depend on best-effort in-process execution.

**Why it matters:** The PR claims to fix durable dispatch, but a straightforward deployment misconfiguration silently reintroduces the original reliability risk for all queued jobs.

## Findings

- `CRON_SECRET` is optional in [`src/libs/Env.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/Env.ts:9), so production can boot without any durable-dispatch credential.
- The auth gate in [`src/app/api/internal/generation-jobs/dispatch/route.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/app/api/internal/generation-jobs/dispatch/route.ts:51) returns `false` when both tokens are absent, and `GET`/`POST` map that to a generic `401`.
- The README explains the required setup in [`README.md`](/Users/piotrkreglicki/Projects/exercise-maker/README.md:124), but there is no fail-fast validation or even a warning log if the deployment misses that step.

## Proposed Solutions

### Option 1: Require cron auth in production (Recommended)

**Approach:** Make `CRON_SECRET` mandatory when `NODE_ENV === 'production'`, or otherwise fail application startup with a clear error describing the missing durable-dispatch configuration.

**Pros:**
- Converts a silent production outage into an immediate, obvious deployment failure.
- Keeps the durability guarantee aligned with the PR’s intent.

**Cons:**
- Requires deploy environments to set the secret before rolling out the PR.

**Effort:** Small

**Risk:** Low

---

### Option 2: Warn loudly and degrade explicitly

**Approach:** Keep the env optional, but log a startup or request-time warning that durable dispatch is disabled and the system is falling back to best-effort local worker execution.

**Pros:**
- Avoids hard startup failures.
- Makes the degraded mode observable.

**Cons:**
- Still allows a misconfigured production deployment.
- Relies on operators noticing logs after the fact.

**Effort:** Small

**Risk:** Medium

---

### Option 3: Add a deployment health check

**Approach:** Add a verification endpoint or startup self-check that validates cron auth is configured and surfaces a clear unhealthy signal if not.

**Pros:**
- Preserves flexibility while making the issue detectable.
- Useful for operational dashboards.

**Cons:**
- More moving parts than a simple fail-fast validation.

**Effort:** Medium

**Risk:** Medium

## Recommended Action

Require `CRON_SECRET` or `GENERATION_DISPATCH_TOKEN` in production so durable dispatch cannot silently degrade to best-effort local execution.

## Technical Details

**Affected files:**
- `src/libs/Env.ts`
- `src/app/api/internal/generation-jobs/dispatch/route.ts`
- `README.md`

**Related components:**
- Vercel cron configuration in `vercel.json`
- Exercise generation enqueue path and local worker fallback

**Database changes (if any):**
- No

## Resources

- **PR:** #24
- **Branch:** `codex/fix-generation-dispatch-durability`
- **Route:** `src/app/api/internal/generation-jobs/dispatch/route.ts`
- **Docs:** `README.md`

## Acceptance Criteria

- [x] Production cannot boot with durable dispatch half-configured, or emits a high-signal warning that durable dispatch is disabled
- [x] Operators have an explicit indication that generation jobs are falling back to best-effort local execution
- [x] Tests cover the missing-secret behavior

## Work Log

### 2026-03-05 - Review finding

**By:** Codex (ce-review)

**Actions:**
- Reviewed PR #24 dispatch auth flow and deployment setup changes.
- Traced the missing-secret path through env validation and route auth logic.
- Compared implementation guarantees against the PR’s stated durability fix.

**Learnings:**
- The code path is durable only when deployment config is correct, but the repo does not yet enforce or loudly surface that requirement.

### 2026-03-05 - Production fail-fast added

**By:** Codex

**Actions:**
- Added production-only fail-fast validation in [`src/libs/Env.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/Env.ts) requiring `CRON_SECRET` or `GENERATION_DISPATCH_TOKEN`.
- Added [`src/libs/Env.test.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/Env.test.ts) to cover both the failing production path and the allowed development path.
- Re-ran dispatch and worker regression coverage to ensure the new validation does not break the durable-dispatch flow.

**Learnings:**
- The safest way to preserve the durability guarantee is to block half-configured production boots rather than rely on operators noticing warnings.
