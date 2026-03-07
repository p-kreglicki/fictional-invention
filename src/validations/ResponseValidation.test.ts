import { describe, expect, it } from 'vitest';
import {
  EvaluationResultSchema,
  ExerciseCardSchema,
  SubmitResponseRequestSchema,
} from './ResponseValidation';

describe('SubmitResponseRequestSchema', () => {
  it('parses multiple choice submissions', () => {
    const result = SubmitResponseRequestSchema.safeParse({
      exerciseId: '550e8400-e29b-41d4-a716-446655440000',
      answer: 2,
      clientSubmissionId: '550e8400-e29b-41d4-a716-446655440001',
      responseTimeMs: 18000,
    });

    expect(result.success).toBe(true);
  });

  it('rejects blank text submissions', () => {
    const result = SubmitResponseRequestSchema.safeParse({
      exerciseId: '550e8400-e29b-41d4-a716-446655440000',
      answer: '   ',
      clientSubmissionId: '550e8400-e29b-41d4-a716-446655440001',
    });

    expect(result.success).toBe(false);
  });
});

describe('EvaluationResultSchema', () => {
  it('parses evaluation payloads', () => {
    const result = EvaluationResultSchema.safeParse({
      score: 82,
      rubric: {
        accuracy: 32,
        grammar: 24,
        fluency: 18,
        bonus: 8,
      },
      overallFeedback: 'Strong answer with a small agreement error.',
      suggestedReview: ['definite articles'],
      evaluationMethod: 'llm',
    });

    expect(result.success).toBe(true);
  });
});

describe('ExerciseCardSchema', () => {
  it('parses sanitized fill-gap cards', () => {
    const result = ExerciseCardSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440010',
      type: 'fill_gap',
      difficulty: 'beginner',
      question: 'Ieri ___ al mercato.',
      grammarFocus: 'passato prossimo',
      createdAt: '2026-03-05T10:30:00.000Z',
      timesAttempted: 2,
      averageScore: 75,
      latestResponse: null,
      renderData: {
        hint: 'Use the verb andare',
      },
    });

    expect(result.success).toBe(true);
  });

  it('rejects leaked answer keys', () => {
    const result = ExerciseCardSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440010',
      type: 'fill_gap',
      difficulty: 'beginner',
      question: 'Ieri ___ al mercato.',
      grammarFocus: 'passato prossimo',
      createdAt: '2026-03-05T10:30:00.000Z',
      timesAttempted: 2,
      averageScore: 75,
      latestResponse: null,
      renderData: {
        answer: 'sono andato',
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects multiple choice cards with duplicate options', () => {
    const result = ExerciseCardSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440010',
      type: 'multiple_choice',
      difficulty: 'beginner',
      question: 'Quale forma e corretta?',
      grammarFocus: 'imperfetto',
      createdAt: '2026-03-05T10:30:00.000Z',
      timesAttempted: 2,
      averageScore: 75,
      latestResponse: null,
      renderData: {
        options: ['andava', 'andava', 'andranno', 'andrei'],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['renderData.options'],
        }),
      ]),
    );
  });
});
