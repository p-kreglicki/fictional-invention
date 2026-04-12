# Dashboard add-content modal

## Summary
Move the dashboard hero’s `Add content` action from a page navigation to an in-place modal so users can upload resources without leaving the overview. The modal will stay open after a successful upload, reset the form for another submission, and show a compact recent-uploads list so users can confirm the new item appeared.

## Implementation changes
- Replace the dashboard CTA link in [DashboardOverview.tsx](/Users/piotrkreglicki/Projects/exercise-maker/src/components/dashboard/DashboardOverview.tsx) with a button that opens a new `DashboardAddContentModal` client component.
- Extract the document bootstrap/upload/delete/polling logic from [DocumentsWorkspace.tsx](/Users/piotrkreglicki/Projects/exercise-maker/src/components/documents/DocumentsWorkspace.tsx) into a reusable controller hook, then reuse it in:
  - the existing full content page workspace
  - the new dashboard modal
- Keep the full content page as the complete management screen; the modal is a lighter entry point, not a replacement.
- Extend the upload/library presentation components just enough for reuse:
  - `DocumentUploadPanel` gets a header-less/modal mode so the dialog owns the main title and close affordance
  - `DocumentsLibrary` gets a compact recent-items mode with `createdAt` descending sort and a hard limit of 5 items
- The modal includes:
  - dialog title/description in the dashboard namespace
  - the existing PDF / URL / Text form
  - recent uploads list with current status badges and delete action
  - a secondary link/button to open the full content library
- Dashboard data flow:
  - opening the modal loads documents
  - upload success keeps the modal open, clears form state, shows success feedback, refreshes recent uploads, and refreshes dashboard summary counts
  - delete from the recent list refreshes both the list and summary counts
  - polling runs only while the modal is open and there are uploading/processing documents
- Modal behavior:
  - accessible `role="dialog"` / `aria-modal` markup
  - close button, overlay click, and `Escape` close when no upload/delete request is in flight
  - focus returns to the `Add content` trigger on close
  - responsive layout: centered modal on desktop, full-width / tall modal on mobile without hiding primary actions
- Translation changes:
  - add dashboard-modal wrapper strings to `DashboardOverviewPage`
  - reuse existing `DashboardContentPage` upload and library copy where it still fits
- External APIs/types:
  - no backend/API route changes
  - internal component interfaces gain modal/compact props, and a new shared documents-state hook becomes the reuse boundary

## Test plan
- Add a dashboard component test that opens the modal from `Add content` and verifies the form plus recent uploads render.
- Add/adjust documents workspace tests to cover shared controller behavior: bootstrap, upload success, delete success, and polling refresh.
- Add presentation tests for:
  - `DocumentUploadPanel` modal/header-less rendering
  - `DocumentsLibrary` compact recent-items mode and 5-item limit
- Add a dashboard interaction test proving successful upload:
  - keeps the modal open
  - resets form inputs
  - refreshes summary counts on the overview
- Verify modal close behavior and focus return.
- Manual acceptance check on desktop and mobile layouts for scrolling, button reachability, and recent-upload visibility.

## Assumptions
- The dashboard modal should show the 5 most recent documents and keep delete available there.
- Successful upload should prepare the form for another submission immediately rather than redirecting away.
- Existing content page behavior and routes remain intact; users still have the full content library for broader management.
