---
title: "feat: Phase 5 Frontend and UX"
type: feat
date: 2026-03-06
status: completed
parent: docs/plans/2026-02-28-feat-italian-rag-learning-tool-plan.md
---

# Phase 5: Frontend and UX

## Overview

Build the learner-facing workspace that completes the MVP flow across content upload, document management, exercise generation, answer submission, and progress review.

**Goal:** Deliver a coherent authenticated product flow so a learner can upload material, wait for ingestion, generate exercises, answer them, and review recent performance without relying on raw API calls or placeholder pages.

**Estimated effort:** 4-6 days

---

## Source scope carried forward

From the parent plan at [`docs/plans/2026-02-28-feat-italian-rag-learning-tool-plan.md`](./2026-02-28-feat-italian-rag-learning-tool-plan.md), Phase 5 requires:

- Upload interface for PDF, URL, and plain text
- Content library with status badges and delete confirmation
- Exercise generation UI with document selection and generation controls
- Exercise presentation and inline answer submission
- Feedback display with score breakdown
- Progress history with filtering and score trends

This plan narrows that broad phase to the current repository state and defines the missing UI and supporting read APIs required to finish it.

---

## Research Summary

### Brainstorm check

No matching brainstorm document was found in `docs/brainstorms/`.

### Key findings

| Area | Finding | Impact |
|------|---------|--------|
| Current authenticated IA | The dashboard only exposes `/dashboard/`, `/dashboard/user-profile/`, and `/dashboard/exercises/` via `src/app/[locale]/(auth)/dashboard/layout.tsx` | Phase 5 needs new navigation and clearer task separation |
| Existing exercises UI | `src/components/exercises/ExercisesDashboard.tsx` already bootstraps ready documents, active jobs, and exercise cards | Keep exercise generation and answer submission on the existing exercises page |
| Existing upload/data APIs | Upload, list, status, and delete APIs already exist under `src/app/[locale]/api/documents/*` | Frontend work should reuse current contracts instead of inventing new upload transport |
| Existing generation/evaluation flow | `POST /api/exercises/generate`, job polling, `GET /api/exercises`, and `POST /api/responses/submit` are already wired | Phase 5 is mostly a read-model, workflow, and UX completion phase |
| Current data gap | There is no dedicated progress-history endpoint or page, and `GET /api/exercises` only returns the latest response summary | Progress filtering and trend views require a supporting read API |
| Current UX gap | The dashboard root is still a placeholder `Hello` page in `src/app/[locale]/(auth)/dashboard/page.tsx` | The landing experience should direct learners into content upload and practice workflows |
| I18n pattern | User-facing strings live in locale JSON files under `src/locales/` and page namespace keys mirror page/component responsibilities | All new UX copy must be localized, with new namespaces for content and progress surfaces |

### Institutional learnings

From `docs/solutions/integration-issues/exercise-generation-hardening-pr23-system-20260305.md`:

1. Polling loops must not overlap in-flight requests.
2. Client-correctable failures should stay `4xx`, while internal failures stay `5xx`.
3. Provenance and async job state need explicit contracts across API and UI boundaries.

From `docs/solutions/integration-issues/answer-evaluation-hardening-pr26-system-20260306.md`:

1. Browser-side request gating is UX only; the server remains the source of truth.
2. Public frontend DTOs should stay sanitized and separate from persistence shapes.
3. Missing client-side runtime validation can create brittle retry and reload behavior.

From `todos/035-pending-p3-unsafe-client-data-parsing-exercise-cards.md`:

1. New frontend state persisted in browser storage must be runtime-validated before reuse.

### External research decision

Skipped. The repo already contains strong local patterns, recent plans for Phases 2-4, and concrete API contracts for the exact workflow this phase must surface. This phase is primarily product integration and UX completion, not a new or high-risk technical domain.

---

## Problem Statement

The backend and core service layers now support content ingestion, async exercise generation, and answer evaluation, but the product still feels incomplete:

- learners cannot upload content from the authenticated UI
- document lifecycle states are not visible anywhere in the product
- the exercises page only works once documents are already ready
- the dashboard landing page does not guide the user into the real workflow
- response history and score trends are persisted but not explorable from the UI

Without this phase, the app remains a partial demo rather than a usable study tool.

---

## Proposed Solution

Create a three-surface learner workspace inside the authenticated dashboard:

1. **Overview**
   - Replace the placeholder dashboard root with a lightweight overview page that summarizes document counts, active generation jobs, recent scores, and links into the main tasks.
   - Back it with one lightweight summary endpoint so the page does not depend on 3-4 client-side fetches or a waterfall bootstrap.
2. **Content**
   - Add a dedicated content page for upload, ingestion status, failed-upload recovery, and document deletion.
3. **Exercises**
   - Keep the current exercises page as the practice workspace, but make it depend on content-page outcomes and improve empty/loading/error states.
4. **Progress**
   - Add a progress page for recent attempts, document filtering, and a simple score-trend view.

This keeps each page focused while preserving the existing route and component structure.

### Information architecture

```text
/dashboard
  -> overview cards
  -> links to content, exercises, progress

/dashboard/content
  -> upload panel
  -> processing/ready/failed document library
  -> delete confirmation and retry guidance

/dashboard/exercises
  -> ready-document selection
  -> generation jobs
  -> answer submission
  -> latest feedback per exercise

/dashboard/progress
  -> recent response history
  -> filter by source document
  -> score trend summary
```

### Alternative approaches considered

#### Single all-in-one workspace page

Rejected. Upload polling, generation polling, answer submission, and history filtering on one screen would create state collisions, too many empty states, and poor mobile ergonomics.

#### Keep progress history inside `/dashboard/exercises`

Rejected. The current exercises page already carries generation controls, active jobs, exercise cards, and latest feedback. Adding historical exploration there would turn the page into a mixed live-and-archive surface with conflicting user intent.

---

## SpecFlow Analysis

### User flow overview

#### 1. First-time learner

1. Sign in and land on `/dashboard`
2. Follow CTA to `/dashboard/content`
3. Upload PDF, URL, or pasted text
4. Watch status move from `uploading`/`processing` to `ready`
5. Open `/dashboard/exercises`
6. Select ready documents, generate exercises, answer one, and read feedback
7. Open `/dashboard/progress` to review the attempt

#### 2. Returning learner with ready documents

1. Open `/dashboard/exercises`
2. Generate more exercises from existing ready documents
3. Submit answers
4. Review recent attempts and score change over time

#### 3. Learner with failed or stuck content

1. Open `/dashboard/content`
2. See failed badge and failure message
3. Delete failed document
4. Re-upload corrected content

#### 4. Learner resuming after reload

1. Reload during document processing or exercise generation
2. Content page rehydrates document statuses
3. Exercises page rehydrates active jobs and generated exercises
4. Progress page rehydrates recent attempts from persisted response history

### Gaps to resolve in this phase

| Category | Gap | Plan decision |
|----------|-----|---------------|
| Navigation | No task-oriented dashboard structure | Add overview, content, and progress routes plus nav entries |
| Upload UX | No authenticated upload form despite live APIs | Build a dedicated content workspace on top of existing upload/list/delete endpoints |
| Status recovery | Processing and failure states are invisible | Poll documents on the content page and render status-specific actions/messages |
| History | No way to browse past attempts or trends | Add a dedicated read endpoint and progress page |
| Filtering semantics | An exercise may be generated from multiple documents | Store indexed `sourceDocumentIds` on exercises and treat a progress item as matching when the selected document ID is present in that set |
| Reload resilience | Frontend storage is already identified as brittle in todo `035` | Validate any session/local persisted client state before reuse |
| Accessibility | Current exercise cards are usable but basic | Add explicit labels, live status copy, and keyboard-safe confirmation flows across new surfaces |

### Critical assumptions

1. The document upload API remains asynchronous with polling, not streaming.
2. A progress filter by document should include multi-document exercises when the selected document ID is present in the exercise's persisted `sourceDocumentIds`.
3. Trend visualization can start as a lightweight recent-score chart or summary strip; advanced analytics are out of scope.

---

## Technical Approach

### Route and component plan

#### Dashboard overview

**Files**

- `src/app/[locale]/(auth)/dashboard/page.tsx`
- `src/components/dashboard/DashboardOverview.tsx`

**Responsibilities**

- Replace the placeholder greeting page with summary cards:
  - total documents
  - ready documents
  - active generation jobs
  - recent average score
- Provide clear entry CTAs to content, exercises, and progress
- Reuse existing authenticated page and translation patterns
- Fetch a single `GET /api/dashboard/summary` payload rather than orchestrating multiple page-level requests

#### Content workspace

**Files**

- `src/app/[locale]/(auth)/dashboard/content/page.tsx`
- `src/components/documents/DocumentsWorkspace.tsx`
- `src/components/documents/DocumentUploadPanel.tsx`
- `src/components/documents/DocumentsLibrary.tsx`
- `src/components/documents/DeleteDocumentDialog.tsx`

**Responsibilities**

- Support all three upload modes:
  - PDF via `FormData`
  - URL via JSON
  - plain text via JSON
- Render document cards with:
  - title
  - content type
  - status badge
  - chunk count when ready
  - failure message when failed
  - source/original filename metadata where relevant
- Poll documents while any item is `uploading` or `processing`
- Allow delete with explicit confirmation
- Trigger deletion from a dialog/button flow that issues a same-origin `fetch(..., { method: 'DELETE' })`; do not implement link-based destructive navigation
- Remove a document from the visible list only after the API returns success; do not use optimistic removal in the initial Phase 5 implementation
- Keep ready documents usable immediately in the exercises page after refresh

#### Exercises workspace refinement

**Files**

- `src/components/exercises/ExercisesDashboard.tsx`
- `src/components/exercises/ExerciseGeneratorForm.tsx`
- `src/components/exercises/GenerationJobStatus.tsx`
- `src/components/exercises/ExerciseCards.tsx`

**Responsibilities**

- Keep the current page route: `src/app/[locale]/(auth)/dashboard/exercises/page.tsx`
- Improve empty states based on real prerequisites:
  - no documents yet
  - documents still processing
  - documents failed
  - no generated exercises yet
- Surface navigation back to content when there are no ready documents
- Preserve the current generation polling contract and non-overlapping poll behavior
- Tighten browser-state validation for submission drafts before reuse
- Keep latest-feedback rendering inline on exercise cards

#### Progress workspace

**Files**

- `src/app/[locale]/(auth)/dashboard/progress/page.tsx`
- `src/components/progress/ProgressDashboard.tsx`
- `src/components/progress/ProgressFilters.tsx`
- `src/components/progress/ProgressHistoryList.tsx`
- `src/components/progress/ScoreTrendChart.tsx`

**Responsibilities**

- List recent attempts with:
  - score
  - exercise type
  - document titles
  - feedback summary
  - timestamp
- Filter by source document
- Show a simple recent-score trend for the current filter
- Keep the first iteration read-only; editing or deleting response history is out of scope

### Supporting API additions

Frontend scope requires two supporting read-model endpoints so new pages stay simple and do not fan out into multiple client requests:

#### `GET /api/dashboard/summary`

**New route**

- `src/app/[locale]/api/dashboard/summary/route.ts`

**Response shape**

- `documentCounts`
  - `total`
  - `uploading`
  - `processing`
  - `ready`
  - `failed`
- `activeGenerationJobsCount`
- `recentAverageScore`
  - define as average score across the user's 20 most recent responses
  - return `null` when there is no response history

**Why this exists**

- avoids 3-4 separate overview-page fetches
- keeps aggregation server-side
- preserves room to compute the summary with efficient parallel DB queries behind one stable frontend contract

#### `GET /api/responses`

**New route**

- `src/app/[locale]/api/responses/route.ts`

**Query shape**

- `documentId?: uuid`
- `limit?: number`
  - default `20`
  - max `100`
- `cursor?: string`
  - opaque pagination cursor

**Operational constraints**

- apply user-scoped Arcjet rate limiting, matching the repo's existing pattern for authenticated endpoints that can be abused via repeated polling or scraping
- return stable `429` error envelopes and rate-limit headers when the limit is exceeded

**Response shape**

- paginated recent attempts
- learner-safe exercise metadata
- source document summaries for filtering
- score trend summary for the selected slice
  - bounded to the filtered user's last `100` responses
  - additionally capped to the last `30` days

**Filter strategy**

- Do not implement the document filter as a request-time join across `responses -> exercises -> chunks -> documents`
- Filter against indexed `exercises.sourceDocumentIds` instead

This avoids overloading `GET /api/exercises`, which is optimized for the live practice screen rather than historical exploration.

### Data contracts

#### Reuse existing contracts

- `GET /api/documents`
- `GET /api/documents/[id]`
- `DELETE /api/documents/[id]`
- `POST /api/documents/upload`
- `GET /api/exercises`
- `POST /api/exercises/generate`
- `GET /api/exercises/jobs/[id]`
- `POST /api/responses/submit`

#### Extend validation modules

**Files**

- `src/validations/DocumentValidation.ts`
- `src/validations/ResponseValidation.ts`

**Additions**

- learner-facing document list DTO for content page reuse
- progress-history DTOs and filters
- runtime-safe client parsing helpers where browser storage or fetch payloads are reused

#### Supporting schema addition for progress filtering

**File**

- `src/models/Schema.ts`

**Addition**

- add `sourceDocumentIds: uuid[]` to `exercisesSchema`
- populate it when an exercise is created from the resolved source chunks
- add a GIN index so `GET /api/responses?documentId=` can filter with an indexed array-membership query instead of chunk joins

**Rationale**

- the history filter semantics are stable and explicit
- the progress endpoint stays cheap enough to paginate
- the frontend does not depend on a complex multi-join query for a common workflow

### State and polling rules

| Surface | State model | Polling rule |
|---------|-------------|--------------|
| Content page | Local list of documents + upload submission state | Poll only while at least one document is `uploading` or `processing` |
| Exercises page | Existing local documents/jobs/exercises state | Keep current guarded 2-second job polling for active generation jobs |
| Progress page | Filter state + paginated response history | No polling required; fetch on load and filter changes |

The initial Phase 5 implementation does not require SWR/React Query. A single-bootstrap overview request and on-demand progress fetches are sufficient for MVP. If navigation profiling later shows redundant refetch pain, shared query caching can be added as a follow-up instead of becoming a prerequisite for this phase.

### Design and UX rules

- Preserve existing utility-class/Tailwind style unless a shared UI primitive already exists.
- Keep forms simple and task-oriented; avoid modal-heavy workflows except delete confirmation.
- Prefer visibly distinct states for `uploading`, `processing`, `ready`, and `failed`.
- Use concise, localized copy with sentence case.
- Make mobile layout intentional:
  - upload controls stack vertically
  - status metadata collapses cleanly
  - long feedback blocks wrap without overflowing cards

### Accessibility requirements

- Label all upload controls and answer inputs explicitly
- Provide keyboard-accessible document selection and delete confirmation
- Announce async status regions for uploads and generation jobs
- Ensure color is not the only status indicator

### Error boundary strategy

- Continue relying on the existing global application error boundary for uncaught failures.
- Add route-segment `error.tsx` boundaries for the new dashboard surfaces where recoverable page-level fallback improves UX:
  - `/dashboard/content`
  - `/dashboard/progress`
- Keep inline fetch and validation errors in component state where the user can retry without losing page context.
- Reserve error boundaries for unexpected render/bootstrap failures, not expected API validation errors.

---

## Implementation Plan

### Phase 5.1: Navigation and dashboard overview

**Goal:** Turn the authenticated area into a task-oriented product shell.

- [x] Replace `src/app/[locale]/(auth)/dashboard/page.tsx` placeholder content with an overview page
- [x] Add `GET /api/dashboard/summary` for overview bootstrap
- [x] Update `src/app/[locale]/(auth)/dashboard/layout.tsx` navigation to include:
  - content
  - exercises
  - progress
- [x] Add translation namespaces/keys for overview and new nav labels
- [x] Keep the existing user-profile route unchanged

**Acceptance criteria**

- [x] Signed-in users land on a meaningful dashboard overview
- [x] Overview data loads through one summary request, not multiple page-level fetches
- [x] Navigation exposes content, exercises, and progress explicitly
- [x] All new labels are localized in `src/locales/en.json` and `src/locales/fr.json`

### Phase 5.2: Content upload and document management

**Goal:** Make content ingestion usable from the UI.

- [x] Build `DocumentUploadPanel` supporting:
  - PDF file selection/dropzone
  - URL submission
  - pasted text submission
- [x] Build `DocumentsLibrary` showing all document statuses
- [x] Poll `GET /api/documents` while uploads are active
- [x] Add delete confirmation flow backed by `DELETE /api/documents/[id]`
- [x] Remove deleted documents from the UI only after confirmed API success
- [x] Render user-correctable errors inline from current API contracts
- [x] Keep the library resilient across reloads

**Acceptance criteria**

- [x] Learners can upload PDF, URL, and text without leaving the dashboard
- [x] Processing, ready, and failed states are visible and understandable
- [x] Deleting a document removes it from the library after confirmation
- [x] Failed uploads can be cleared and retried through the UI

### Phase 5.3: Exercises workspace completion

**Goal:** Connect content readiness to generation and answering in a polished flow.

- [x] Refine `ExercisesDashboard` bootstrap messaging based on document readiness
- [x] Add CTA back to `/dashboard/content` when no ready documents exist
- [x] Keep ready-document selection and generation controls, but improve state messaging
- [x] Preserve current job polling guard behavior
- [x] Harden client parsing for submission drafts and any new cached payloads
- [x] Keep latest-feedback rendering stable after reload

**Acceptance criteria**

- [x] Users understand why generation is unavailable when there are no ready documents
- [x] Exercise generation still works after adding content through the new content page
- [x] Answer submission and latest feedback remain functional and reload-safe
- [x] Client-side stored draft corruption does not block future submissions

### Phase 5.4: Progress history and trends

**Goal:** Surface recent learning performance without turning the exercises page into an archive.

- [x] Add `sourceDocumentIds` exercise read-model support with an indexed filter path
- [x] Add `GET /api/responses` read endpoint with query validation
- [x] Add bounded pagination validation for `limit` and opaque cursor handling
- [x] Add Arcjet rate limiting for `GET /api/responses`
- [x] Create `ProgressDashboard` page and component set
- [x] Render recent attempt history with source-document context
- [x] Add filter by document
- [x] Show a lightweight recent-score trend summary bounded to a fixed response/time window
- [x] Link back to exercises for continued practice

**Acceptance criteria**

- [x] Users can review recent attempts from the dashboard
- [x] Filtering by document works for single- and multi-document exercises without a deep chunk-join query on every request
- [x] Trend summary updates with the active filter
- [x] Pagination rejects oversized `limit` values with a validation error
- [x] Large response histories do not require loading everything into the exercises bootstrap

### Phase 5.5: Polish, accessibility, and test coverage

**Goal:** Close UX gaps and verify the end-to-end learner journey.

- [x] Add component tests for upload form states, document list rendering, and progress filters
- [x] Add route tests for the new responses history endpoint
- [x] Add dashboard segment error boundaries for content and progress routes
- [x] Add at least one Playwright flow covering:
  - upload content
  - wait for ready state
  - generate exercise
  - submit answer
  - view progress history
- [x] Audit mobile layout and keyboard navigation

**Acceptance criteria**

- [x] The full learner journey works end to end
- [x] New UI surfaces have localized copy and basic accessibility coverage
- [x] Tests protect the new read-model and workflow behavior

---

## System-Wide Impact

### Interaction graph

```text
Dashboard content page
  -> POST /api/documents/upload
      -> reserve slot
      -> async ingestion
      -> GET /api/documents polling updates UI

Exercises page
  -> POST /api/exercises/generate
      -> generation job
      -> GET /api/exercises/jobs/{id} polling
      -> GET /api/exercises rehydrates exercises

Exercise card submit
  -> POST /api/responses/submit
      -> response persisted
      -> inline latest feedback updates
      -> GET /api/responses powers later progress review
```

### Error and failure propagation

- Upload `429`, `422`, and `503` responses should render actionable, localized messages on the content page.
- Generation failures stay visible through existing job cards and should not be reclassified by the UI.
- Response-history fetching failures should degrade to a recoverable empty/error state on `/dashboard/progress`, not break the rest of the dashboard.
- Unexpected render/bootstrap failures on the new content and progress pages should fall through to segment-level error boundaries with a retry path.

### State lifecycle risks

- Deleting a document that is currently selected on the exercises page can leave stale client selection state.
  - Mitigation: reconcile selected document IDs against the latest ready-document list after every bootstrap/poll cycle.
- Delete requests can succeed server-side after a confirmation dialog but before local state catches up.
  - Mitigation: remove the item from UI only after success, then reconcile downstream selections against the refreshed document list.
- Persisted client drafts can become malformed.
  - Mitigation: runtime-validate browser-stored data before reuse.
- History filtering can become ambiguous for multi-document exercises.
  - Mitigation: persist `sourceDocumentIds` on exercises and filter by indexed membership instead of reconstructing provenance through chunk joins per request.

### API surface parity

- Any new history DTO must stay learner-safe and avoid exposing answer keys or evaluator-only fields.
- New frontend fetch code should match the repo’s current route error-envelope style.
- The overview page should use `GET /api/dashboard/summary` as its single bootstrap contract.

### Integration test scenarios

1. Upload a URL, reload during processing, and verify the document eventually appears as `ready`.
2. Delete a failed document, re-upload replacement content, and verify it becomes selectable on the exercises page.
3. Generate exercises from two documents, submit an answer, and verify the progress filter matches either document.
4. Corrupt stored submission-draft data in browser storage and verify new submissions still succeed.
5. Reload with an active generation job and verify polling resumes without duplicate requests.

---

## Dependencies and Risks

### Dependencies

- Phase 2 document APIs must remain stable
- Phase 3 generation jobs and exercises bootstrap must remain stable
- Phase 4 answer submission and latest-response DTOs must remain stable

### Risks

#### Risk: the new progress UI overloads the existing exercises bootstrap endpoint

- Mitigation: add a dedicated read endpoint for history instead of expanding `GET /api/exercises`

#### Risk: polling logic is duplicated across content and exercises pages

- Mitigation: keep polling rules isolated and minimal; extract shared helpers only if duplication becomes meaningful during implementation

#### Risk: dashboard IA grows beyond MVP needs

- Mitigation: keep the overview lightweight and task-oriented; avoid advanced analytics, notifications, or social/progress gamification

#### Risk: upload page and exercises page drift apart on document-state handling

- Mitigation: reuse a shared document summary type and normalize status rendering from one DTO shape

---

## Out of Scope

- Real-time streaming via SSE or WebSockets
- Advanced analytics beyond simple recent-score trends
- Response-history editing or deletion
- Exercise regeneration from a history item
- Collaborative or shared study spaces
- Design-system overhaul or new component library adoption

---

## Acceptance Criteria

- [x] Authenticated users can upload PDF, URL, and text content from the dashboard
- [x] Users can see document statuses and delete documents from a content-management page
- [x] Users can navigate from content preparation to exercise generation without guesswork
- [x] The exercises page explains prerequisite states clearly and preserves current generation/submission behavior
- [x] Users can review recent progress with document filtering and a score-trend summary
- [x] New surfaces are localized, responsive, and keyboard-accessible
- [x] The end-to-end flow `upload -> ready -> generate -> answer -> feedback -> progress review` is covered by automated tests

---

## Success Metrics

- A new learner can complete the full study flow without leaving the authenticated dashboard.
- The dashboard no longer depends on placeholder or developer-facing pages for core product tasks.
- Frontend reloads preserve async workflow continuity for uploads, generation jobs, and latest feedback.
- Progress review uses dedicated read models rather than expanding the live practice payload indefinitely.

---

## Sources and References

### Parent plan

- `docs/plans/2026-02-28-feat-italian-rag-learning-tool-plan.md`

### Internal references

- `src/app/[locale]/(auth)/dashboard/layout.tsx`
- `src/app/[locale]/(auth)/dashboard/page.tsx`
- `src/app/[locale]/(auth)/dashboard/exercises/page.tsx`
- `src/components/exercises/ExercisesDashboard.tsx`
- `src/components/exercises/ExerciseGeneratorForm.tsx`
- `src/components/exercises/ExerciseCards.tsx`
- `src/components/exercises/GenerationJobStatus.tsx`
- `src/app/[locale]/api/documents/upload/route.ts`
- `src/app/[locale]/api/documents/route.ts`
- `src/app/[locale]/api/documents/[id]/route.ts`
- `src/app/[locale]/api/exercises/route.ts`
- `src/app/[locale]/api/responses/submit/route.ts`
- `src/libs/ExercisePresenter.ts`
- `src/models/Schema.ts`
- `src/validations/ResponseValidation.ts`
- `src/locales/en.json`
- `src/locales/fr.json`

### Institutional learnings

- `docs/solutions/integration-issues/exercise-generation-hardening-pr23-system-20260305.md`
- `docs/solutions/integration-issues/answer-evaluation-hardening-pr26-system-20260306.md`
- `todos/035-pending-p3-unsafe-client-data-parsing-exercise-cards.md`
