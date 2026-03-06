---
status: complete
priority: p2
issue_id: "034"
tags: [code-review, security, llm]
dependencies: []
---

# LLM evaluation prompt integrity risk in answer scoring

## Problem Statement

User-submitted text answers are interpolated directly into the LLM evaluation prompt for `single_answer` exercises and near-match `fill_gap` fallbacks. Because the answer is inserted verbatim inside pseudo-XML delimiters, a malicious user can include prompt-like instructions or delimiter-breaking content that may bias the grading result.

This is primarily an evaluation-integrity issue. The current implementation does not demonstrate meaningful secret exposure, but it does rely on the model treating untrusted answer text as data rather than instructions.

## Findings

**Locations:**
- `/src/libs/AnswerEvaluationPrompts.ts` inserts `input.userAnswer` directly between `<user_answer>` tags
- `/src/libs/AnswerEvaluation.ts` passes those prompts into structured LLM evaluation for `single_answer` and fallback `fill_gap` scoring

```typescript
`<user_answer>`,
input.userAnswer,
`</user_answer>`,
```

**Current mitigations already in place:**
- `SubmitResponseRequestSchema` caps text answers at 2000 characters
- LLM calls use `temperature: 0`
- `LlmEvaluationSchema` and `EvaluationResultSchema` constrain the output shape and score range

**Why those mitigations are insufficient:**
- The schema validates structure, not whether the score is justified
- An injected response can still produce a schema-valid `score: 100`
- The pseudo-XML wrapper is not escaped, so an answer can include `</user_answer>` and alter the apparent prompt structure

**Practical impact:**
- Users may be able to bias grading on LLM-evaluated answers
- Feedback quality may degrade or become instruction-following instead of answer evaluation
- Risk appears limited to the submitting user's own evaluation results

## Proposed Solutions

### Option A: Encode untrusted answer text before prompt assembly (Recommended)

Serialize the user answer as data instead of inserting raw text into pseudo-markup. For example, escape delimiter-breaking characters or embed the answer as JSON string content that cannot close surrounding sections.

**Pros:**
- Removes the prompt-boundary break caused by raw interpolation
- Addresses delimiter injection without brittle keyword filters
- Small, localized change

**Cons:**
- Does not guarantee the model will never over-weight malicious text
- Still depends on prompt quality for final grading behavior

**Effort:** Small (2-4 hours)
**Risk:** Low

### Option B: Strengthen prompt contract and grading guardrails

Update the system and user prompts to explicitly treat the answer as untrusted student content, then add lightweight consistency checks for obviously unjustified rubric totals where deterministic checks are available.

**Pros:**
- Defense in depth on top of prompt encoding
- Reduces the chance of schema-valid but unreasonable scores

**Cons:**
- Adds some implementation complexity
- Hard to make fully deterministic for open-ended answers

**Effort:** Medium (1-2 days)
**Risk:** Medium

### Option C: Monitoring and adversarial regression coverage

Add tests with adversarial answers and log suspicious evaluation patterns for later review.

**Pros:**
- Helps catch regressions
- Useful as defense in depth

**Cons:**
- Reactive rather than preventive
- Monitoring does not prevent a single bad grade

**Effort:** Small to medium (4-6 hours)
**Risk:** Low

## Recommended Action

Implement Option A and Option B:
1. Stop embedding raw `userAnswer` text directly inside pseudo-XML sections
2. Encode or escape the answer so it is treated as data, not prompt structure
3. Tighten the evaluation prompt to explicitly ignore instructions contained inside the student answer
4. Add regression tests for delimiter-breaking and instruction-style payloads

Do not rely on keyword-based prompt-injection detection such as matching `"ignore"` or `"system:"`; that is brittle and easy to bypass.

## Technical Details

**Affected Files:**
- `/src/libs/AnswerEvaluationPrompts.ts`
- `/src/libs/AnswerEvaluation.ts`
- `/src/libs/AnswerEvaluation.test.ts`
- `/src/libs/AnswerEvaluationPrompts.test.ts`

**Components:**
- Answer evaluation LLM integration

## Acceptance Criteria

- [x] LLM-evaluated answers are encoded or escaped before prompt assembly
- [x] Prompt construction does not allow user answers to break the intended answer section boundaries
- [x] Unit tests cover adversarial answers such as embedded closing tags and instruction-style payloads
- [x] The todo reflects this as an evaluation-integrity risk, not a confirmed secret-exfiltration issue

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-03-06 | Created during PR #26 code review | Identified by security-sentinel agent |
| 2026-03-06 | Re-reviewed against prompt assembly, schema validation, and request limits | Raw interpolation is real, but impact is narrower than the original writeup claimed; this is better tracked as a p2 integrity issue |
| 2026-03-06 | Replaced raw answer interpolation with JSON-serialized prompt payloads and stronger evaluator instructions | Removing pseudo-XML answer boundaries closes the delimiter-break path while keeping the answer readable for grading |
| 2026-03-06 | Added adversarial regression tests and ran `npm test -- src/libs/AnswerEvaluation.test.ts src/libs/AnswerEvaluationPrompts.test.ts` plus `npm run check:types` | The evaluation path now passes malicious answer text as data and the targeted test suite stays green |

## Resources

- PR #26: https://github.com/p-kreglicki/fictional-invention/pull/26
- OWASP Prompt Injection: https://owasp.org/www-project-top-10-for-large-language-model-applications/
