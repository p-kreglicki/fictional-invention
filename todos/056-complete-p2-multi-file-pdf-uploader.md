---
status: complete
priority: p2
issue_id: "056"
tags: [frontend, upload, documents, untitledui]
dependencies: []
---

# Multi-file PDF uploader

Add a shared multi-file PDF uploader with live progress, upload states, and retry support across the dashboard, modal, and full documents page.

## Problem Statement

The current PDF upload flow supports only one file at a time and does not expose live upload progress or per-file retry state. That falls short of the requested UX and underuses the Untitled UI file-upload primitives already present in the repo.

## Findings

- `DocumentUploadPanel` currently uses the Untitled UI dropzone only as a single-file picker and renders a separate submit button plus one selected-file summary.
- `useDocumentsWorkspace` sends PDFs with `fetch`, so it cannot emit upload progress events.
- The backend already accepts one PDF per request and returns `202` plus `documentId`, then completes ingestion asynchronously.
- Existing document polling can be reused to reconcile accepted uploads into final `ready` or `failed` outcomes.

## Proposed Solutions

### Option 1: Sequential client queue

**Approach:** Queue dropped PDFs client-side, upload them one at a time with `XMLHttpRequest`, and keep rows alive through processing completion.

**Pros:**
- Matches the current backend contract
- Simplest progress and retry model
- Lowest pressure on rate limiting and deferred job queue

**Cons:**
- Slower than parallel upload for large batches

**Effort:** Medium

**Risk:** Low

---

### Option 2: Small parallel queue

**Approach:** Upload 2-3 files concurrently while tracking each row independently.

**Pros:**
- Faster total throughput

**Cons:**
- More client complexity
- Higher chance of backend contention and rate limiting

**Effort:** Medium-high

**Risk:** Medium

## Recommended Action

Implement the sequential client queue using the existing Untitled UI uploader primitives, preserve the current backend API, and extend polling/retry behavior to handle post-acceptance processing failures.

## Technical Details

**Affected areas:**
- Shared documents workspace state and PDF upload transport
- Shared document upload panel UI
- Shared upload tests and dashboard/documents integration tests

**Database changes:**
- None

## Resources

- Plan: `docs/plans/multi-file-PDF-uploader-plan.md`
- Existing UI primitive: `src/components/untitled/application/file-upload/file-upload-base.tsx`

## Acceptance Criteria

- [x] PDF mode accepts multiple files in one session across all upload surfaces
- [x] Each file row shows live progress and final state
- [x] Retry works for pre-acceptance and post-processing failures
- [x] URL and text flows keep current behavior
- [x] Relevant tests pass

## Work Log

### 2026-03-09 - Execution start

**By:** Codex

**Actions:**
- Read the approved plan and existing upload implementation
- Verified the repo already includes Untitled UI upload primitives
- Created a feature branch for implementation

**Learnings:**
- The backend contract is already sufficient for a client-side sequential queue
- The main implementation risk is keeping session rows synchronized with async document processing

### 2026-03-09 - Implementation complete

**By:** Codex

**Actions:**
- Reworked the shared documents workspace to own a sequential PDF upload queue, XHR progress tracking, document reconciliation, and retry behavior
- Rebuilt the shared PDF upload panel around the local Untitled UI file uploader primitives and per-file progress rows
- Added coverage for queued upload submission, sequential PDF uploads, failed-processing retry replacement, and shared dashboard rendering
- Ran targeted UI tests, typecheck, and ESLint on the touched files

**Learnings:**
- Returning real UUIDs in mocked document payloads matters because the workspace parser validates the API response with zod before reconciling session rows
- The cleanest retry model for post-processing failures is delete-then-requeue because it preserves the existing backend contract
