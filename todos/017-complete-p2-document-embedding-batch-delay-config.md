---
status: complete
priority: p2
issue_id: "017"
tags: [code-review, reliability, operations, configuration]
dependencies: []
---

# Document embedding batch delay configuration

## Problem Statement

`MISTRAL_EMBEDDING_BATCH_DELAY_MS` is implemented as the new control for inter-batch throttling, but deployment-facing documentation does not mention it.

**Why it matters:** Operators cannot discover this setting from setup docs. In environments with strict provider rate limits, leaving the default (`0`) can cause avoidable embedding failures under multi-batch workloads.

## Findings

- `src/libs/Env.ts:12` adds and validates `MISTRAL_EMBEDDING_BATCH_DELAY_MS`.
- `src/libs/Env.ts:37` wires the new variable into `runtimeEnv`.
- `src/libs/Mistral.ts:115` uses the value to control batch throttling.
- `README.md:47` environment variable docs do not include this new key.
- Existing known pattern: `todos/014-pending-p2-31s-rate-limit-delay.md` discusses rate-limit pressure and recommends configurable throttling.

## Proposed Solutions

### Option 1: Update setup documentation (Recommended)

**Approach:** Add `MISTRAL_EMBEDDING_BATCH_DELAY_MS` to the README environment section with clear guidance (e.g., `0` for no delay, positive value for throttling).

**Pros:**
- Fast and low-risk
- Improves deployment correctness immediately
- Aligns docs with current runtime behavior

**Cons:**
- Relies on manual operator configuration

**Effort:** Small

**Risk:** Low

---

### Option 2: Add `.env.example` with all required and optional keys

**Approach:** Introduce a canonical environment template and include `MISTRAL_EMBEDDING_BATCH_DELAY_MS` there.

**Pros:**
- Scales better than README snippets
- Easier onboarding and fewer missed variables

**Cons:**
- Slightly larger docs/process change

**Effort:** Medium

**Risk:** Low

---

### Option 3: Add runtime warning when unthrottled batching is active

**Approach:** When processing more than one batch with delay `0`, log an informational warning about potential provider rate limits.

**Pros:**
- Gives operators immediate runtime signal
- Helps detect misconfiguration in production logs

**Cons:**
- Adds log noise
- Does not replace documentation

**Effort:** Small

**Risk:** Low

## Recommended Action

Document `MISTRAL_EMBEDDING_BATCH_DELAY_MS` directly in setup instructions with explicit
default and rate-limited guidance so operators can choose an intentional value per environment.

## Technical Details

**Affected files:**
- `src/libs/Env.ts`
- `src/libs/Mistral.ts`
- `README.md`

**Related components:**
- Embedding ingestion flow in `src/libs/ContentIngestion.ts`
- Environment validation via `@t3-oss/env-nextjs`

**Database changes (if any):**
- Migration needed? No
- New columns/tables? None

## Resources

- **PR:** https://github.com/p-kreglicki/fictional-invention/pull/22
- **Related todo:** `todos/014-pending-p2-31s-rate-limit-delay.md`
- **Code references:** `src/libs/Env.ts:12`, `src/libs/Env.ts:37`, `src/libs/Mistral.ts:115`, `README.md:47`

## Acceptance Criteria

- [x] `MISTRAL_EMBEDDING_BATCH_DELAY_MS` is documented in setup docs with valid values and examples
- [x] Documentation explains default behavior when variable is unset (`0` delay)
- [x] Documentation explains when to set a positive delay (rate-limited plans)
- [x] Team confirms deployment envs have an explicit value decision

## Work Log

### 2026-03-05 - Initial Discovery

**By:** Codex

**Actions:**
- Reviewed PR #22 diff and validated behavior with tests
- Cross-checked environment documentation against new runtime variable
- Linked finding to prior rate-limit todo for context continuity

**Learnings:**
- Code and tests for configurable throttling are solid
- Operator-facing docs lag behind the new configuration surface

### 2026-03-05 - Resolution

**By:** Codex

**Actions:**
- Updated `README.md` environment section with `MISTRAL_EMBEDDING_BATCH_DELAY_MS`
- Added explicit behavior notes for unset/`0` and positive delay values
- Closed todo after documentation acceptance criteria were met

**Learnings:**
- A short inline explanation next to env samples removes ambiguity for ops teams

## Notes

- This finding does not block merge if deployment team already manages env variables outside README, but it is recommended to close before wider rollout.
