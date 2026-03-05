---
status: complete
priority: p2
issue_id: "024"
tags: [code-review, frontend, performance, reliability]
dependencies: []
---

# Prevent overlapping generation status polls

The exercises dashboard polling loop can start a new fetch cycle before the prior one finishes, causing avoidable request amplification and stale-state races.

## Problem Statement

Polling uses `setInterval(..., 2000)` and triggers async job fetches without an in-flight guard. Under slow networks or temporary backend latency, multiple intervals can overlap and flood `/api/exercises/jobs/:id`.

## Findings

- Polling is timer-driven every 2 seconds in [`src/components/exercises/ExercisesDashboard.tsx:122`](/Users/piotrkreglicki/Projects/exercise-maker/src/components/exercises/ExercisesDashboard.tsx:122).
- The callback runs async fetches and state merges, but interval scheduling does not wait for completion [`src/components/exercises/ExercisesDashboard.tsx:123`](/Users/piotrkreglicki/Projects/exercise-maker/src/components/exercises/ExercisesDashboard.tsx:123).
- No request cancellation or in-flight lock is present for polling cycles in [`src/components/exercises/ExercisesDashboard.tsx:157`](/Users/piotrkreglicki/Projects/exercise-maker/src/components/exercises/ExercisesDashboard.tsx:157).

## Proposed Solutions

### Option 1: Add in-flight guard around interval callback (recommended)

**Approach:** Keep `setInterval`, but skip cycles while a prior poll is running.

**Pros:**
- Minimal code change
- Prevents overlapping fetch storms

**Cons:**
- Poll interval becomes effectively "at least 2s" under load
- Requires careful reset on errors/unmount

**Effort:** 30-90 minutes  
**Risk:** Low

---

### Option 2: Replace with recursive `setTimeout`

**Approach:** Start next poll only after current cycle settles.

**Pros:**
- Natural backpressure
- Cleaner async control flow

**Cons:**
- Slightly larger refactor
- More timer lifecycle logic

**Effort:** 1-2 hours  
**Risk:** Low

---

### Option 3: Use data-fetching library polling

**Approach:** Move to SWR/React Query polling with dedupe/retry policies.

**Pros:**
- Built-in stale/in-flight management
- Better long-term data sync ergonomics

**Cons:**
- Introduces dependency and migration effort
- Larger change than needed right now

**Effort:** 0.5-1 day  
**Risk:** Medium

## Recommended Action

Implement Option 1 now for a low-risk fix. If dashboard data-fetching grows, consider Option 3 later.

## Technical Details

**Affected files:**
- [`src/components/exercises/ExercisesDashboard.tsx:122`](/Users/piotrkreglicki/Projects/exercise-maker/src/components/exercises/ExercisesDashboard.tsx:122)
- [`src/components/exercises/ExercisesDashboard.tsx:157`](/Users/piotrkreglicki/Projects/exercise-maker/src/components/exercises/ExercisesDashboard.tsx:157)

## Resources

- PR: [#23](https://github.com/p-kreglicki/fictional-invention/pull/23)

## Acceptance Criteria

- [x] Poll cycle never overlaps with another in-flight poll
- [x] No regression in live job status updates
- [x] Added test coverage (or deterministic integration check) for non-overlap behavior

## Work Log

### 2026-03-05 - Code review discovery

**By:** Codex

**Actions:**
- Analyzed polling lifecycle and effect dependencies
- Verified interval-driven async behavior can overlap under latency
- Drafted low-risk mitigation options

**Learnings:**
- Current merge logic is robust for dedupe, but network load still increases unnecessarily without in-flight control

### 2026-03-05 - Implementation completed

**By:** Codex

**Actions:**
- Added polling lock helper in [`PollingGate.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/components/exercises/PollingGate.ts)
- Added unit tests in [`PollingGate.test.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/components/exercises/PollingGate.test.ts)
- Updated polling loop in [`ExercisesDashboard.tsx`](/Users/piotrkreglicki/Projects/exercise-maker/src/components/exercises/ExercisesDashboard.tsx) to skip overlapping cycles and avoid updates after cleanup
- Verified with `npm test -- src/components/exercises/PollingGate.test.ts`, `npm run check:types`, and `npm run lint`

**Learnings:**
- A tiny lock abstraction keeps UI polling behavior deterministic without introducing additional dependencies
