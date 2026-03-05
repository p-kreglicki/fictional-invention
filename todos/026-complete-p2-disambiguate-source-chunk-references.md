---
status: complete
priority: p2
issue_id: "026"
tags: [code-review, data-integrity, ai-generation, retrieval]
dependencies: []
---

# Source chunk references are ambiguous across multiple documents

## Problem Statement

Generated exercises store `sourceChunkPositions` as position-only integers. When multiple selected documents share the same chunk position (for example `0`, `1`, `2`), provenance resolution can attach chunk IDs from unintended documents.

**Why it matters:** Exercise grounding metadata becomes unreliable, which affects traceability and downstream trust in generated content.

## Findings

- Response schema accepts only numeric positions in [ExerciseValidation.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/validations/ExerciseValidation.ts:20).
- Prompt includes both `document_id` and `chunk_position` for each excerpt in [ExercisePrompts.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/ExercisePrompts.ts:43), but the model is asked to return only positions.
- Resolution filters candidates by position only in [ExerciseGeneration.ts](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/ExerciseGeneration.ts:468), so same-position chunks across documents are indistinguishable.

## Proposed Solutions

### Option 1: Return structured source references (Recommended)

**Approach:** Change generated schema to include `{ documentId, chunkPosition }[]` and map chunk IDs from both fields.

**Pros:**
- Removes ambiguity completely.
- Preserves robust provenance for auditing.

**Cons:**
- Requires prompt/schema updates and migration path for consumers.

**Effort:** Medium

**Risk:** Low

---

### Option 2: Return excerpt indices instead of raw chunk positions

**Approach:** In prompt, require source references by `EXCERPT_n` index, then map deterministically back to candidate rows.

**Pros:**
- Simple deterministic mapping.
- Less model burden than emitting UUIDs.

**Cons:**
- Still requires schema contract change.

**Effort:** Medium

**Risk:** Low

---

### Option 3: Restrict generation to single-document requests

**Approach:** Temporarily enforce one document per job to avoid cross-document position collisions.

**Pros:**
- Fast mitigation.

**Cons:**
- Reduces feature capability.
- Avoids, rather than solves, provenance modeling gap.

**Effort:** Small

**Risk:** Medium

## Recommended Action

Implement structured `sourceReferences` (`documentId` + `chunkPosition`) end-to-end and validate each generated reference against the selected excerpt subset before insert.

## Technical Details

**Affected files:**
- `src/validations/ExerciseValidation.ts`
- `src/libs/ExercisePrompts.ts`
- `src/libs/ExerciseGeneration.ts`

**Related components:**
- Exercise provenance in `exercises.source_chunk_ids`

## Resources

- PR: https://github.com/p-kreglicki/fictional-invention/pull/23
- Source: `src/libs/ExerciseGeneration.ts`

## Acceptance Criteria

- [x] Generated source references uniquely identify one chunk candidate
- [x] Multi-document requests cannot map one reference to multiple documents
- [x] Validation rejects ambiguous/unresolvable source references
- [x] Tests cover duplicate chunk-position cases across different documents

## Work Log

### 2026-03-05 - Initial discovery

**By:** Codex (ce-review)

**Actions:**
- Reviewed generation response schema and prompt contract.
- Traced source reference mapping from model output to DB chunk IDs.
- Identified ambiguity path for shared chunk positions across documents.

**Learnings:**
- Position-only references are insufficient for multi-document provenance.

### 2026-03-05 - Implementation completed

**By:** Codex

**Actions:**
- Replaced `sourceChunkPositions` with `sourceReferences` in [`src/validations/ExerciseValidation.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/validations/ExerciseValidation.ts), including duplicate pair validation.
- Updated generation prompt contract in [`src/libs/ExercisePrompts.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/ExercisePrompts.ts) to require `{ documentId, chunkPosition }` references.
- Added `resolveGeneratedSourceReferenceCandidates` and enforced subset validation/resolution before exercise insert in [`src/libs/ExerciseGeneration.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/ExerciseGeneration.ts).
- Added/updated tests in:
  - [`src/validations/ExerciseValidation.test.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/validations/ExerciseValidation.test.ts)
  - [`src/libs/ExercisePrompts.test.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/ExercisePrompts.test.ts)
  - [`src/libs/ExerciseGeneration.test.ts`](/Users/piotrkreglicki/Projects/exercise-maker/src/libs/ExerciseGeneration.test.ts)
- Verified with `npm test -- src/validations/ExerciseValidation.test.ts src/libs/ExercisePrompts.test.ts src/libs/ExerciseGeneration.test.ts`, `npm run check:types`, and `npm run lint`.

**Learnings:**
- Validating model references against the active subset prevents silent provenance drift without changing DB schema.

## Notes

- This is important for correctness and auditability, especially as retrieval scope grows.
