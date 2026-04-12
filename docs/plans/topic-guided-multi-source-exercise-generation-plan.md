# Topic-Guided Multi-Source Exercise Generation

## Summary
Adopt `topic-guided` generation as the default contract for exercise creation. Selected documents become supporting topical context rather than exact sentence provenance. The generator may use one or more selected sources to create new exercises that are consistent with the topic, grammar focus, and vocabulary implied by those materials.

This changes the meaning of `sourceReferences`: they will represent supporting materials used during generation, not the exact origin sentence of the rendered exercise text.

## Implementation Changes
- Update the generation contract in prompt-building and validation:
  - Remove the new strict fill-gap “must derive from exactly one excerpt sentence” rule.
  - Keep the existing structural rules that still matter:
    - `multiple_choice`: exactly 4 unique options and one correct index
    - `fill_gap`: exactly one `___` placeholder and a short exact missing answer
    - `single_answer`: sample answer plus grading criteria
  - Rewrite prompt rules so all exercise types are topic-guided by default:
    - selected sources provide topic/vocabulary/grammar context
    - generated sentences may be newly written
    - exercises must stay semantically consistent with the selected materials
    - avoid mixing unrelated topics when multiple documents are selected

- Rework `sourceReferences` semantics:
  - Treat them as “materials used to generate this exercise.”
  - Allow multiple references for `fill_gap` and `multiple_choice`; do not require a single source for fill-gap.
  - Keep uniqueness by `(documentId, chunkPosition)`.
  - Update any tests and developer-facing wording that still imply exact provenance.

- Replace excerpt-grounding validation with topic-guided validation:
  - Remove the runtime fill-gap grounding check that rejects newly written sentences not present verbatim in an excerpt.
  - Add lighter validation aimed at topic consistency instead of verbatim overlap.
  - Minimum v1 validation:
    - referenced candidates must still come from the selected subset
    - fill-gap answer must be non-empty and plausible for the generated sentence shape
    - no cross-document hard requirement for “all tokens appear in one source”
  - Do not attempt strict semantic relevance scoring in v1; rely on prompt constraints plus existing source subset selection.

- Adjust prompts by exercise type:
  - `fill_gap`: generate a new topical sentence that tests relevant vocabulary/grammar; blank one contiguous word or short phrase.
  - `multiple_choice`: generate a new sentence-completion question with plausible distractors based on the selected topic.
  - `single_answer`: continue allowing broader synthesis across sources.
  - When multiple documents are selected, explicitly instruct the model to use them to broaden topic coverage and reduce repetition, not to splice unrelated details together.

- Preserve current request/UI shape for v1:
  - No new `generationMode` field.
  - No new UI control.
  - Multi-source topic-guided behavior becomes the default backend behavior for all generation requests.
  - Keep existing document multi-select UX unchanged.

## Test Plan
- Validation tests:
  - `fill_gap` accepts topic-guided sentences with one placeholder even when not copied verbatim from any excerpt.
  - `fill_gap` no longer fails for having more than one `sourceReference`.
  - `multiple_choice` still rejects meta/grammar-table style prompts if that rule remains.
  - `sourceReferences` still reject duplicate `(documentId, chunkPosition)` pairs.

- Prompt tests:
  - fill-gap prompt states that sources are topical guidance, not exact sentence templates
  - prompt explicitly allows new sentences consistent with selected materials
  - prompt explicitly encourages diversity when multiple documents are selected

- Worker/runtime tests:
  - generation succeeds for a fill-gap exercise written as a new sentence but supported by selected-topic materials
  - generation succeeds when two references are attached to one fill-gap exercise
  - generation still fails when `sourceReferences` point outside the provided subset
  - duplicate-question retry and MCQ randomization behavior remain unchanged

- Route/integration tests:
  - existing generate endpoint tests continue to pass with unchanged request shape
  - no response payload assumptions still rely on exact sentence provenance

## Assumptions and Defaults
- Default behavior changes globally to topic-guided generation; there is no selectable strict mode in this iteration.
- `sourceReferences` mean supporting context, not exact sentence origin.
- Topic-guided `fill_gap` may use newly written sentences as long as they are consistent with the selected materials.
- Diversity from multiple selected documents is desired; exact provenance is not required for the exercise sentence itself.
- v1 will not introduce semantic ranking or LLM-based relevance verification beyond prompt constraints and existing subset/reference checks.
