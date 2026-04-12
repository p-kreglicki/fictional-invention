---
module: System
date: 2026-03-06
problem_type: integration_issue
component: service_object
symptoms:
  - "Retried or concurrent answer submissions could create duplicate responses or stale exercise statistics"
  - "LLM-evaluated answers accepted raw student text inside prompt boundaries"
  - "Production upload, generation, and submission routes could run without rate limiting when ARCJET_KEY was missing"
  - "Clerk user deletion could not safely remove owned data because document cleanup had to happen before relational row deletion"
  - "New answer-evaluation read paths depended on hot document and chunk lookups without dedicated indexes"
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [pr26, answer-evaluation, submissions, prompt-safety, rate-limiting, account-deletion, indexes]
---

# Troubleshooting: PR26 answer evaluation hardening

## Problem
PR26 introduced the answer-submission and evaluation flow, then follow-up review found several integration gaps across request idempotency, LLM prompt construction, production rate-limit enforcement, deletion ordering, and database hot paths. The feature worked on the happy path, but retries, misconfiguration, and cleanup side effects could still produce incorrect or unsafe behavior.

## Environment
- Module: System-wide answer evaluation flow
- Affected component: Submission route, evaluation services, deletion webhook, and database schema
- Date: 2026-03-06

## Symptoms
- Repeating the same logical submission after a refresh or transport failure could create a second `responses` row and inflate `timesAttempted` or `averageScore`.
- Concurrent submissions for the same exercise could race while recomputing denormalized exercise stats.
- Student answers were interpolated directly into evaluation prompts, so delimiter-breaking text could bias grading.
- If `ARCJET_KEY` was missing in production, request throttling silently disappeared for upload, generation, and response submission.
- Deleting a user required document-level Pinecone cleanup before relational rows could be removed safely.

## What Didn't Work

**Attempted Solution 1:** Rely on client-side submit gating and one UUID per fetch call.  
- **Why it failed:** retried requests generated a fresh `clientSubmissionId`, so the server-side uniqueness guard only protected exact duplicate IDs, not duplicate logical submissions.

**Attempted Solution 2:** Recompute exercise aggregates inside a transaction without locking the exercise row.  
- **Why it failed:** parallel submissions could insert independently, observe inconsistent aggregate state, and overwrite one another's denormalized stats.

**Attempted Solution 3:** Embed raw `userAnswer` text inside pseudo-XML prompt sections.  
- **Why it failed:** malicious or malformed answer text could close delimiters or inject instructions while still producing schema-valid output.

**Attempted Solution 4:** Warn and continue when Arcjet configuration was missing.  
- **Why it failed:** production traffic could reach expensive or abuse-sensitive endpoints without any rate limiting.

**Attempted Solution 5:** Depend on database cascades alone for account deletion.  
- **Why it failed:** `documents` need explicit Pinecone cleanup before row removal, so a full cascade would skip required side effects while `NO ACTION` alone blocked deletion.

## Solution

Applied hardening fixes in PR26 follow-up commits (`e89c684`, `75f1db0`, `a65fd9d`, `b38b449`, `1bf8fa2`, `5f5bf4c`):

1. Persisted and replayed stable submission IDs per logical browser attempt so retries return the original success payload instead of creating a new response.
2. Added an exercise-row `FOR UPDATE` lock before inserting a response and recomputing aggregate statistics.
3. Replaced raw pseudo-XML answer interpolation with JSON-serialized prompt payloads and explicit evaluator instructions to treat the answer as untrusted data.
4. Centralized Arcjet misconfiguration handling so production routes fail closed with `503 SERVICE_UNAVAILABLE` when `ARCJET_KEY` is missing.
5. Implemented a hybrid deletion strategy: explicit document cleanup first, then relational cascades for exercises, responses, and generation jobs.
6. Optimized latest-response reads and added indexes for `documents(user_id, created_at desc)` and `chunks(document_id)` to support the new flow under growing data volume.

**Code changes (excerpt):**
```ts
// Preserve logical submission identity across retries.
const clientSubmissionId = existingDraft?.answerKey === answerKey
  ? existingDraft.clientSubmissionId
  : crypto.randomUUID();
```

```ts
// Serialize concurrent stat updates for the same exercise.
await tx.execute(
  sql`SELECT ${exercisesSchema.id} FROM ${exercisesSchema}
      WHERE ${exercisesSchema.id} = ${input.exerciseId}
      AND ${exercisesSchema.userId} = ${input.userId}
      FOR UPDATE`,
);
```

```ts
// Treat student answers as data, not prompt structure.
const payload = JSON.stringify({
  exercise: { type: 'single_answer', question, referenceAnswer, gradingCriteria },
  studentAnswer: input.userAnswer,
}, null, 2);
```

## Why This Works

The root issue was missing boundary hardening between the new answer-evaluation feature and the systems around it:

1. The browser needed a stable logical submission identity, but retries were creating fresh IDs.
2. The write path denormalized stats, but concurrent writes were not serialized per exercise.
3. The LLM boundary treated untrusted answer text as part of prompt structure instead of plain data.
4. Security-critical production behavior depended on optional configuration instead of explicit failure.
5. User deletion combined relational data and external vector-store cleanup, so the deletion order mattered.

The fixes restore explicit contracts at each boundary:
- retries are idempotent,
- concurrent submissions serialize safely,
- prompts receive student text as JSON data,
- production rejects requests when rate limiting is unavailable,
- account deletion preserves Pinecone cleanup before database cascades,
- hot paths use database-supported lookup indexes.

## Prevention

- Treat client-side submit disabling as UX only; enforce idempotency on the server.
- Lock the owning row before recomputing denormalized aggregates from child rows.
- Never interpolate untrusted user text directly into markup-like LLM prompts.
- Fail closed for required production security controls instead of warning and continuing.
- Avoid blanket database cascades when external cleanup must happen first.
- Add explicit indexes for every new read path that lands on request or polling hot loops.
- Keep follow-up tests for retry semantics, concurrent writes, prompt-boundary abuse, and deletion failure paths close to the implementation.

## Related Issues

- PR: [#26](https://github.com/p-kreglicki/fictional-invention/pull/26)
- Related solution doc:
  - [PR23 exercise generation hardening](./exercise-generation-hardening-pr23-system-20260305.md)
- Completed PR26 follow-up tasks:
  - [031](../../../todos/031-complete-p2-preserve-submission-id-across-retries.md)
  - [032](../../../todos/032-complete-p2-query-only-latest-exercise-responses.md)
  - [033](../../../todos/033-complete-p2-phase-response-migration-rollout.md)
  - [034](../../../todos/034-complete-p2-llm-evaluation-prompt-integrity-risk.md)
  - [036](../../../todos/036-complete-p2-race-condition-aggregate-stats.md)
  - [038](../../../todos/038-complete-p2-rate-limiting-disabled-fallback.md)
  - [040](../../../todos/040-complete-p2-missing-on-delete-cascade-strategy.md)
- Remaining follow-ups:
  - [035](../../../todos/035-pending-p3-unsafe-client-data-parsing-exercise-cards.md)
  - [039](../../../todos/039-pending-p3-levenshtein-unbounded-accepted-answers.md)
  - [043](../../../todos/043-pending-p3-extract-rate-limit-helpers.md)
  - [044](../../../todos/044-pending-p3-add-validation-error-details.md)
