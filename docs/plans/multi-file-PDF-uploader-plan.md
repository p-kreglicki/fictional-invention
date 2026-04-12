# Shared multi-file PDF uploader with live progress

## Summary
Upgrade the shared document upload experience across the dashboard, modal, and full content page to support selecting multiple PDFs in one session, showing real-time per-file progress, surfacing `in progress` / `completed` / `failed` states, and allowing retry. Keep the backend upload API unchanged: each PDF still posts individually to `/api/documents/upload`; batching is handled by a client-side sequential queue.

Use the existing Untitled UI primitives already vendored in the repo from [file-upload-base.tsx](/Users/piotrkreglicki/Projects/exercise-maker/src/components/untitled/application/file-upload/file-upload-base.tsx): the PDF mode should be rebuilt around `FileUpload.Root`, `FileUpload.DropZone`, `FileUpload.List`, and the progress-row list item component rather than the current single-file summary text.

## Key changes
### Upload lifecycle and state
- Add a client-side `PdfUploadSessionItem` model in [useDocumentsWorkspace.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/components/documents/useDocumentsWorkspace.ts) with:
  - stable local id
  - original `File`
  - filename and size
  - `progress` number
  - `phase` union: `queued | uploading | processing | completed | failed`
  - `errorMessage`
  - `documentId?`
- Replace the single `isUploading` PDF flow with a sequential queue runner:
  - selecting files adds them to the session list as `queued`
  - clicking submit starts uploads one at a time
  - upload transport uses `XMLHttpRequest` for PDF mode so progress events can drive the bar in real time
  - when the API returns `202`, set `progress = 100`, store `documentId`, and move the row to `processing`
  - existing document polling reconciles accepted rows to `completed` when the linked document becomes `ready`, or `failed` when the linked document becomes `failed`
- Keep URL and text uploads on the current single-submit `fetch` path with no queue/progress UI changes.

### UI behavior
- Refactor [DocumentUploadPanel.tsx](/Users/piotrkreglicki/Projects/exercise-maker/src/components/documents/DocumentUploadPanel.tsx) so PDF mode:
  - enables multi-file selection on the Untitled UI dropzone
  - renders the session list directly below the dropzone
  - shows per-row states:
    - `uploading`: live percentage and progress bar
    - `processing`: upload complete, waiting for server-side ingestion
    - `completed`: final success state
    - `failed`: error styling plus retry action
- Keep the explicit submit button. In PDF mode it submits the queued batch, not a single selected file.
- Update button/empty-state copy to reflect multiple PDFs per session while preserving current layout variants (`page`, `modal`, `dashboard`).
- Do not add new backend-facing title inputs for PDFs; each file title continues to default from the filename unless the backend already derives something else.

### Retry and failure handling
- Retry must support both failure points:
  - pre-acceptance failure: requeue and resend the original file
  - post-acceptance processing failure: delete the failed document first, then re-upload the original file as its replacement
- The failed row remains in the session list until retry succeeds or the user dismisses it.
- No new batch endpoint and no change to `/api/documents/upload` request/response shape.

### Internal interfaces and copy
- Extend the shared upload panel/workspace contract so the panel receives:
  - current PDF session items
  - queue/add action for dropped files
  - start-upload action
  - retry action
  - optional dismiss/remove action for local session rows
- Keep `submitUrl` and `submitText` interfaces unchanged.
- Add i18n keys for:
  - multi-file PDF hint text
  - queued / processing / completed / failed row labels
  - retry label
  - pluralized submit/loading labels if needed

## Test plan
- Add component tests for the upload panel covering:
  - dropping multiple PDFs into the PDF mode queue
  - submit starting the sequential queue
  - live progress rendering
  - failed row retry rendering
- Add workspace tests covering:
  - sequential upload order
  - row transition `queued -> uploading -> processing -> completed`
  - pre-acceptance retry
  - processing-failure retry deleting the failed document before re-upload
- Update shared-surface tests so dashboard, modal, and full page all render the upgraded PDF uploader.
- Keep existing route tests largely unchanged; only add coverage if a helper used by PDF upload transport changes observable request behavior.

## Assumptions
- Multi-file support applies to PDF uploads only; URL and text remain single-item flows.
- `Completed` means the full two-stage row finished and the linked document reached `ready`, not merely that bytes finished uploading.
- Sequential uploads are the chosen default to stay aligned with current rate limiting and the server’s bounded deferred-processing queue.
- The implementation uses the local Untitled UI components already present in the repo rather than introducing a different uploader library.
