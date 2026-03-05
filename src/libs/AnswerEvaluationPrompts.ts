type FillGapPromptInput = {
  question: string;
  acceptedAnswers: string[];
  userAnswer: string;
  grammarFocus: string | null;
};

type SingleAnswerPromptInput = {
  question: string;
  sampleAnswer: string;
  gradingCriteria: string[];
  userAnswer: string;
  grammarFocus: string | null;
};

export function buildEvaluationSystemPrompt() {
  return [
    'You are an Italian language evaluator.',
    'Score the answer with this rubric:',
    '- Accuracy (0-40)',
    '- Grammar (0-30)',
    '- Fluency (0-20)',
    '- Bonus (0-10)',
    'Be strict, deterministic, and concise.',
    'Return valid JSON only.',
  ].join('\n');
}

export function buildFillGapFallbackUserPrompt(input: FillGapPromptInput) {
  return [
    `<exercise>`,
    `Type: fill_gap`,
    `Question: ${input.question}`,
    `Accepted answers: ${input.acceptedAnswers.join(' | ')}`,
    `Grammar focus: ${input.grammarFocus ?? 'none'}`,
    `</exercise>`,
    `<user_answer>`,
    input.userAnswer,
    `</user_answer>`,
    'Treat obviously equivalent punctuation, apostrophes, or article contractions as valid when appropriate.',
  ].join('\n');
}

export function buildSingleAnswerUserPrompt(input: SingleAnswerPromptInput) {
  return [
    `<exercise>`,
    `Type: single_answer`,
    `Question: ${input.question}`,
    `Reference answer: ${input.sampleAnswer}`,
    `Grading criteria: ${input.gradingCriteria.join(' | ')}`,
    `Grammar focus: ${input.grammarFocus ?? 'none'}`,
    `</exercise>`,
    `<user_answer>`,
    input.userAnswer,
    `</user_answer>`,
  ].join('\n');
}
