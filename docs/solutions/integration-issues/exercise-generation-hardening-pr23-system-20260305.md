---
module: System
date: 2026-03-05
problem_type: integration_issue
component: rails_controller
symptoms:
  - "POST /api/exercises/generate returned 500 INTERNAL_ERROR for malformed JSON payloads"
  - "Exercises dashboard polling could overlap and trigger duplicate /api/exercises/jobs/{id} requests"
  - "Generation source attribution could be ambiguous when multiple documents shared chunk positions"
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [pr23, exercise-generation, api-hardening, polling, validation, provenance]
---

# Troubleshooting: PR23 exercise generation hardening

## Problem
After PR23 introduced async exercise generation, review hardening found multiple integration defects across API validation, client polling lifecycle, and generation provenance mapping. The feature worked on happy paths but degraded under malformed input and concurrent timing conditions.

## Environment
- Module: System-wide exercise generation flow
- Affected component: API routes + client polling + generation pipeline
- Date: 2026-03-05

## Symptoms
- Sending invalid JSON to `POST /api/exercises/generate` produced `500` instead of a client-correctable `422`.
- Under slow responses, dashboard polling could start a new cycle before the previous cycle finished.
- Generated source references could resolve to wrong chunk IDs across multi-document jobs when positions overlapped.

## What Didn't Work

**Attempted Solution 1:** Depend on top-level route error handling for JSON parsing.  
- **Why it failed:** `request.json()` parse errors were treated as generic internal failures and mapped to `500`.

**Attempted Solution 2:** Keep raw `setInterval(..., 2000)` polling with async body.  
- **Why it failed:** timer cadence did not respect in-flight async completion, so cycles overlapped during latency spikes.

**Attempted Solution 3:** Use `sourceChunkPositions` (position-only) for provenance.  
- **Why it failed:** chunk positions are not globally unique across selected documents.

## Solution

Applied hardening fixes in PR23 follow-up commits (`28e3a18`, `3cdce5d`):

1. Added explicit JSON parse guard in generation route and returned `422 INVALID_REQUEST` for malformed payloads.
2. Added polling gate lock to prevent overlapping dashboard poll cycles.
3. Replaced position-only provenance with `{ documentId, chunkPosition }` references and validated references against provided excerpts.
4. Mapped enqueue internal failures to `500` and kept user-correctable failures as `4xx`.
5. Hardened internal dispatch token check with constant-time comparison.

**Code changes (excerpt):**
```ts
// API guard for malformed JSON
const parsedBody = await parseJsonBody(request);
if (!parsedBody.success) {
  return NextResponse.json(
    { error: 'INVALID_REQUEST', message: 'Invalid JSON payload' },
    { status: 422 },
  );
}
```

```ts
// Poll cycle overlap protection
if (!active || !pollingGateRef.current.tryEnter()) {
  return;
}
```

```ts
// Provenance disambiguation contract
sourceReferences: z.array(z.object({
  documentId: z.uuid(),
  chunkPosition: z.number().int().min(0),
}))
```

## Why This Works

The root issue was integration-contract mismatch across layers:
1. API layer treated malformed transport input as server failure.
2. UI timer lifecycle assumed fixed interval instead of async completion.
3. Generation metadata schema lacked a unique identifier for multi-document provenance.

The fixes restore explicit contracts at boundaries:
- malformed client payloads are classified as `422`,
- poll cycles are serialized by a lock,
- source references uniquely identify chunks by `(documentId, chunkPosition)`.

This makes behavior deterministic under malformed input and high-latency conditions.

## Prevention

- Treat JSON parsing as an explicit request-validation step in route handlers.
- For polling loops, always guard against overlapping in-flight cycles.
- Model provenance identifiers as globally unique tuples, not local indexes.
- Keep HTTP status mapping explicit per service error code (`4xx` client-correctable vs `5xx` internal).
- Require regression tests for malformed payloads and async overlap behavior on newly introduced endpoints.

## Related Issues

- PR: [#23](https://github.com/p-kreglicki/fictional-invention/pull/23)
- Completed review tasks:
  - [023](../../../todos/023-complete-p2-return-422-for-invalid-generate-json-payload.md)
  - [024](../../../todos/024-complete-p2-prevent-overlapping-generation-status-polls.md)
  - [026](../../../todos/026-complete-p2-disambiguate-source-chunk-references.md)
  - [027](../../../todos/027-complete-p2-return-500-for-enqueue-internal-failures.md)
  - [028](../../../todos/028-complete-p3-use-constant-time-dispatch-token-compare.md)
- Outstanding reliability risk:
  - [025](../../../todos/025-pending-p1-durable-generation-worker-dispatch.md)
