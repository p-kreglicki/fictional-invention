---
title: "feat: Group generated exercise cards into accordion sets"
type: feat
status: completed
date: 2026-04-12
origin: docs/brainstorms/2026-03-31-grammar-topic-exercise-generation-requirements.md
---

# feat: Group Generated Exercise Cards Into Accordion Sets

## Overview

Render each generated exercise set inside its own accordion container instead of flattening all exercise cards into one shared grid. Use the existing generation job as the canonical set boundary so users can immediately understand which cards came from which request, while preserving current answer-submission behavior inside each card.

This improves clarity for repeated generations today and becomes more important as the product adds distinct generation paths such as grammar-topic generation with clearly separated user-facing modes (see brainstorm: `docs/brainstorms/2026-03-31-grammar-topic-exercise-generation-requirements.md`).

## Problem Statement / Motivation

The current exercise workspace loses set boundaries in the read model and UI:

- `generation_jobs` already stores per-request set membership via `exerciseIds`, but `GET /api/exercises` flattens everything into one `exercises` array.
- `ExercisesDashboard` merges newly arrived exercises into a single client list and sorts only by `createdAt`, so cards from different runs can appear adjacent without any visible grouping.
- `ExerciseCards` renders one grid for all cards, which makes repeated generations hard to scan and obscures the relationship between job status and resulting exercises.

That flattening was acceptable when the product had one document-driven generation path, but it becomes increasingly confusing as users:

- generate multiple exercise batches back-to-back
- vary document selections, difficulty, or topic focus between runs
- need to distinguish current results from older ones after a reload
- move toward multiple generation modes that must remain visually understandable (see brainstorm: `docs/brainstorms/2026-03-31-grammar-topic-exercise-generation-requirements.md`)

## Research Summary

### Brainstorm foundation

Found brainstorm from `2026-03-31`: `grammar-topic-exercise-generation-requirements`. Using it as the origin context for this plan.

Relevant carry-forward decisions:

- The product should present distinct generation flows clearly to the learner, not blur them together (see brainstorm: `docs/brainstorms/2026-03-31-grammar-topic-exercise-generation-requirements.md`).
- Async generation remains job-based, with each request producing its own exercise batch (see brainstorm: `docs/brainstorms/2026-03-31-grammar-topic-exercise-generation-requirements.md`).
- UI clarity is part of the success criteria, not just backend correctness (see brainstorm: `docs/brainstorms/2026-03-31-grammar-topic-exercise-generation-requirements.md`).

### Relevant code and patterns

- `src/models/Schema.ts:177` defines `generation_jobs`, including `exerciseIds`, `requestedCount`, `generatedCount`, `failedCount`, `difficulty`, and `topicFocus`.
- `src/app/[locale]/api/exercises/route.ts:10` currently returns a flat `exercises` array plus `activeJobs`.
- `src/app/[locale]/api/exercises/jobs/[id]/route.ts:16` already exposes one job with nested `exercises`, which proves the grouped shape exists conceptually but only for polling a single job.
- `src/libs/ExerciseGeneration.ts:981` provides `getGenerationJobWithExercises`, and `src/libs/ExerciseGeneration.ts:1090` lists only active jobs; there is no “recent grouped sets” read model yet.
- `src/components/exercises/ExercisesDashboard.tsx:30` bootstraps with flat exercises and separately rendered job status.
- `src/components/exercises/ExerciseCards.tsx:346` renders one shared results heading and one grid for every card.
- `src/components/exercises/GenerationJobStatus.tsx:31` renders job metadata separately from results, which reinforces the current split between “job” and “set”.
- `src/components/untitled/*` already wraps `react-aria-components` primitives for other controls, but the repo has no existing disclosure/accordion wrapper.

### Institutional learnings

- `docs/solutions/integration-issues/exercise-generation-hardening-pr23-system-20260305.md`
  - Keep polling cycles serialized; grouped-set polling must reuse the existing gate pattern.
  - Preserve explicit API contracts at boundaries rather than inferring state client-side.
- `docs/solutions/integration-issues/answer-evaluation-hardening-pr26-system-20260306.md`
  - Keep browser-side state as convenience only; the server should provide the authoritative grouped read model.
  - Validate client-controlled persisted data before reuse; if accordion open state is persisted later, it needs the same treatment.
- `todos/035-pending-p3-unsafe-client-data-parsing-exercise-cards.md`
  - Do not introduce new unvalidated browser-storage structures for grouping or expanded state during the initial implementation.

### External research decision

External research was warranted because the repo has no established accordion pattern, but it already uses `react-aria-components`, so the plan should follow the current framework instead of inventing custom semantics.

### External references

- Official React Aria docs recommend `Disclosure` and `DisclosureGroup` for accordion-like grouped disclosures, with optional `allowsMultipleExpanded` when multiple sections may stay open.
  Source: [React Aria DisclosureGroup](https://react-aria.adobe.com/DisclosureGroup)
- W3C APG defines disclosure/accordion interaction around a button-controlled expandable region, with `Enter` and `Space` toggling expansion and `aria-expanded` reflecting state.
  Source: [W3C Disclosure Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)
- The WAI-ARIA accordion example reinforces the expected header-button/panel structure and accessible labeling for grouped expandable sections.
  Source: [WAI-ARIA Accordion Example](https://www.w3.org/TR/2021/NOTE-wai-aria-practices-1.2-20211129/examples/accordion/accordion.html)

## Proposed Solution

Add an exercise-set read model and render each set in its own accessible accordion panel.

### Core approach

1. Treat one `generation_jobs` row as one exercise set.
2. Add a recent grouped query that returns recent generation jobs with nested exercise cards in job order.
3. Update the exercises API bootstrap response to return grouped sets instead of a single flattened card list.
4. Replace the single `ExerciseCards` grid with an accordion-driven set renderer where each panel contains the cards for one generation request.
5. Keep per-card answer submission unchanged, but update nested state inside the correct set when a response is submitted.

### UI behavior

- Each accordion header summarizes the set:
  - generation timestamp
  - exercise count (`generatedCount / requestedCount`)
  - difficulty, if present
  - topic focus, if present
  - source summary for document mode
- The newest completed set opens by default.
- Sets with in-flight generation can remain visible with status messaging; purely pending jobs with no exercises may continue using the existing lightweight status block until the first card appears.
- Multiple sets may stay open simultaneously via `DisclosureGroup allowsMultipleExpanded`, since learners may compare batches.
- Each accordion header contains "Delete set" button that removes the set and all its exercises.

### Scope boundary

This plan is intentionally scoped to the exercise workspace. It does not propose:

- a generic design-system accordion primitive
- new persistence for expanded/collapsed state
- changes to generation algorithms or answer evaluation
- schema changes unless implementation proves a missing read-model contract that cannot be expressed from existing `generation_jobs.exerciseIds`

## Technical Considerations

- **Architecture impact**
  - The authoritative set boundary already exists in `generation_jobs.exerciseIds`; the missing piece is the grouped read model, not a new entity.
  - API and polling responses should converge on one nested DTO so bootstrap and live updates share a contract.
- **Performance**
  - Bound the number of returned sets, for example the latest 10 jobs.
  - Load nested exercises in bulk and reuse the existing latest-response bulk query to avoid N+1 work.
- **Accessibility**
  - Use `react-aria-components` `Disclosure`/`DisclosureGroup` rather than custom `<details>` or ad hoc button logic.
  - Preserve keyboard toggling and correct header/panel semantics from the official pattern.
- **Internationalization**
  - Add localized strings for set headers, counts, timestamps, and empty-state copy in `src/locales/en.json` and sibling locale files.
- **Product clarity**
  - Keep set headers mode-aware so document-based generation remains understandable now and grammar-topic generation can slot into the same grouping later (see brainstorm: `docs/brainstorms/2026-03-31-grammar-topic-exercise-generation-requirements.md`).

## System-Wide Impact

- **Interaction graph**: `ExercisesDashboard` bootstrap calls `GET /api/exercises`, which should now return grouped sets. Polling `GET /api/exercises/jobs/[id]` should feed the same set shape so active jobs append cards into the correct accordion instead of the flat list.
- **Error propagation**: grouped bootstrap failures remain page-level errors; individual job fetch failures should not collapse unrelated sets. Invalid nested exercise serialization should continue logging and skip only the bad card, not the whole page.
- **State lifecycle risks**: nested updates for answer submission must patch one exercise within one set without reordering or collapsing panels unexpectedly. Avoid storing accordion state in browser storage during the first pass.
- **API surface parity**: `GET /api/exercises` and `GET /api/exercises/jobs/[id]` should expose matching job/set fields so the client does not need separate transforms for bootstrap versus polling.
- **Integration test scenarios**:
  - Generate two batches in sequence and verify they render as two distinct accordion sections after reload.
  - Start a job, receive partial results through polling, and verify new cards stay inside the correct accordion.
  - Submit an answer inside a closed or non-newest set and verify only that card’s stats update.
  - Verify empty-state behavior still works when there are no ready documents or no generated sets.

## SpecFlow Analysis

### Primary user flow

1. User generates a set of exercises.
2. The job appears with status feedback.
3. Once cards exist, the UI renders that job as its own accordion section.
4. User generates a second set with different parameters.
5. The UI shows a second accordion section instead of mixing cards into the first batch.
6. User expands the desired set, answers cards, and reviews feedback in context.

### Edge cases to account for

- A partially successful job (`generatedCount < requestedCount`) should still produce one set container with an accurate status summary.
- A failed job with zero cards should not create an empty accordion shell unless the design explicitly wants failure history surfaced there.
- Reloading the page should preserve grouping from server data without requiring client memory.
- If older exercises are not associated with one of the returned recent jobs, the API should either:
  - include an explicit fallback “Earlier exercises” set, or
  - document that the screen now focuses on recent generated sets rather than an unbounded historical flat list.

## Implementation Outline

### 1. Add grouped exercise-set read model

- Create a server-side helper that lists recent generation jobs for the current user, including completed jobs, and hydrates nested exercise cards from `exerciseIds`.
- Prefer a shared presenter/serializer for both bootstrap and single-job polling responses.

Candidate files:

- `src/libs/ExerciseGeneration.ts`
- `src/libs/ExercisePresenter.ts`
- `src/app/[locale]/api/exercises/route.ts`
- `src/app/[locale]/api/exercises/jobs/[id]/route.ts`

### 2. Replace flat results rendering with set accordion rendering

- Introduce an exercise-set component rather than overloading `ExerciseCards` directly.
- Keep `ExerciseCards` focused on rendering cards for one set, or split card rendering into a smaller inner component.

Candidate files:

- `src/components/exercises/ExercisesDashboard.tsx`
- `src/components/exercises/ExerciseCards.tsx`
- `src/components/exercises/GenerationJobStatus.tsx`
- `src/components/exercises/ExerciseSetAccordion.tsx` (new)

### 3. Localized copy and presentation polish

- Add set-level copy for header labels, status summary, and empty-state guidance.
- Format header metadata so it is scan-friendly without overwhelming the user.

Candidate files:

- `src/locales/en.json`
- `src/locales/fr.json`

### 4. Tests

- Extend API route tests for grouped-set payloads.
- Add component tests that assert:
  - two jobs render as two accordions
  - only cards inside the expanded set are shown
  - answer submission still updates the correct nested card
  - malformed or partial job data does not break the whole workspace

Candidate files:

- `src/app/[locale]/api/exercises/route.test.ts`
- `src/components/exercises/ExerciseCards.test.tsx`
- `src/components/exercises/ExercisesDashboard.test.tsx` (new if needed)

## Acceptance Criteria

- [x] Each generated exercise batch is rendered within its own dedicated accordion container instead of one shared flat results grid.
- [x] Grouping is driven by persisted generation-job membership, not by fragile client heuristics such as timestamps alone.
- [x] Reloading the exercises page preserves grouping correctly for recent exercise sets.
- [x] Polling updates append new cards into the correct set without mixing multiple jobs together.
- [x] Existing answer submission, latest feedback, attempt counts, and average-score updates continue to work inside grouped sets.
- [x] Accordion controls are keyboard-accessible and expose correct expanded/collapsed semantics.
- [x] Empty, partial-success, and failed-generation states remain understandable.
- [x] New copy is localized for supported locales.
- [x] Route and component tests cover multi-set rendering and nested state updates.

## Success Metrics

- Users can distinguish one generation request from another without reading individual card timestamps.
- Repeated generations no longer produce visually mixed result groups.
- No regression in exercise answering flow, polling stability, or bootstrap reliability.

## Dependencies & Risks

- The biggest implementation risk is nested client state: answer updates currently target a flat exercise array and will need a careful, set-aware update path.
- The current bootstrap route returns only flat exercises plus active jobs; introducing grouped sets changes the API contract and tests together.
- Historical exercises that are not surfaced through recent jobs need an explicit product decision rather than being silently dropped.
- If the grammar-topic generation plan lands soon after, set headers should be extended rather than rewritten so they can describe both document and grammar-topic runs (see brainstorm: `docs/brainstorms/2026-03-31-grammar-topic-exercise-generation-requirements.md`).

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-03-31-grammar-topic-exercise-generation-requirements.md](../brainstorms/2026-03-31-grammar-topic-exercise-generation-requirements.md)
  - Carried-forward decisions: keep generation flows understandable, preserve per-request job boundaries, and treat UI clarity as part of feature success.

- **Internal references**
  - [src/models/Schema.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/models/Schema.ts:177)
  - [src/app/[locale]/api/exercises/route.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/app/[locale]/api/exercises/route.ts:10)
  - [src/app/[locale]/api/exercises/jobs/[id]/route.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/app/[locale]/api/exercises/jobs/[id]/route.ts:16)
  - [src/libs/ExerciseGeneration.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/ExerciseGeneration.ts:981)
  - [src/components/exercises/ExercisesDashboard.tsx](/Users/piotrkreglicki/Projects/exercise-maker/src/components/exercises/ExercisesDashboard.tsx:30)
  - [src/components/exercises/ExerciseCards.tsx](/Users/piotrkreglicki/Projects/exercise-maker/src/components/exercises/ExerciseCards.tsx:346)
  - [src/components/exercises/GenerationJobStatus.tsx](/Users/piotrkreglicki/Projects/exercise-maker/src/components/exercises/GenerationJobStatus.tsx:31)

- **Institutional learnings**
  - [docs/solutions/integration-issues/exercise-generation-hardening-pr23-system-20260305.md](../solutions/integration-issues/exercise-generation-hardening-pr23-system-20260305.md)
  - [docs/solutions/integration-issues/answer-evaluation-hardening-pr26-system-20260306.md](../solutions/integration-issues/answer-evaluation-hardening-pr26-system-20260306.md)
  - [todos/035-pending-p3-unsafe-client-data-parsing-exercise-cards.md](/Users/piotrkreglicki/Projects/exercise-maker/todos/035-pending-p3-unsafe-client-data-parsing-exercise-cards.md:1)

- **External references**
  - [React Aria DisclosureGroup](https://react-aria.adobe.com/DisclosureGroup)
  - [W3C Disclosure Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/)
  - [WAI-ARIA Accordion Example](https://www.w3.org/TR/2021/NOTE-wai-aria-practices-1.2-20211129/examples/accordion/accordion.html)

- **Related plans**
  - [docs/plans/2026-03-31-001-feat-grammar-topic-exercise-generation-plan.md](./2026-03-31-001-feat-grammar-topic-exercise-generation-plan.md)
  - [docs/plans/2026-03-06-feat-phase5-frontend-ux-plan.md](./2026-03-06-feat-phase5-frontend-ux-plan.md)
