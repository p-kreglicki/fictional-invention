import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSelect = vi.fn();
const mockCreateStructuredChatCompletion = vi.fn();

vi.mock('@/libs/DB', () => ({
  db: {
    select: mockSelect,
  },
}));

vi.mock('@/libs/Mistral', () => ({
  createStructuredChatCompletion: mockCreateStructuredChatCompletion,
}));

vi.mock('@/libs/Logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function createExerciseRow(input: {
  type: 'multiple_choice' | 'fill_gap' | 'single_answer';
  exerciseData: unknown;
}) {
  return {
    id: '550e8400-e29b-41d4-a716-446655440010',
    type: input.type,
    difficulty: 'intermediate' as const,
    question: input.type === 'fill_gap'
      ? 'Ieri ___ al mercato.'
      : 'Quale risposta è corretta?',
    exerciseData: input.exerciseData,
    grammarFocus: 'passato prossimo',
    timesAttempted: 0,
    averageScore: null,
    createdAt: new Date('2026-03-05T10:00:00.000Z'),
  };
}

describe('AnswerEvaluation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes equivalent fill-gap answers deterministically', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(async () => [createExerciseRow({
          type: 'fill_gap',
          exerciseData: {
            answer: 'L’ho visto',
            acceptedAnswers: ['Lo ho visto'],
            hint: 'Use vedere',
          },
        })]),
      })),
    });

    const { evaluateExerciseAnswer } = await import('./AnswerEvaluation');
    const result = await evaluateExerciseAnswer({
      userId: '550e8400-e29b-41d4-a716-446655440001',
      exerciseId: '550e8400-e29b-41d4-a716-446655440010',
      answer: 'l\'ho visto',
    });

    expect(result.evaluation.score).toBe(100);
    expect(result.evaluation.evaluationMethod).toBe('deterministic');
    expect(mockCreateStructuredChatCompletion).not.toHaveBeenCalled();
  });

  it('uses deterministic scoring for multiple-choice answers', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(async () => [createExerciseRow({
          type: 'multiple_choice',
          exerciseData: {
            options: ['a', 'b', 'c', 'd'],
            correctIndex: 1,
            explanation: 'Only option B matches the tense.',
          },
        })]),
      })),
    });

    const { evaluateExerciseAnswer } = await import('./AnswerEvaluation');
    const result = await evaluateExerciseAnswer({
      userId: '550e8400-e29b-41d4-a716-446655440001',
      exerciseId: '550e8400-e29b-41d4-a716-446655440010',
      answer: 1,
    });

    expect(result.evaluation.score).toBe(100);
    expect(result.evaluation.evaluationMethod).toBe('deterministic');
  });

  it('falls back to the llm for near-miss fill-gap answers', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(async () => [createExerciseRow({
          type: 'fill_gap',
          exerciseData: {
            answer: 'sono andato',
            acceptedAnswers: ['io sono andato'],
            hint: 'Use andare',
          },
        })]),
      })),
    });
    mockCreateStructuredChatCompletion.mockResolvedValue({
      parsed: {
        score: 78,
        rubric: {
          accuracy: 30,
          grammar: 24,
          fluency: 16,
          bonus: 8,
        },
        overallFeedback: 'Close, but the auxiliary agreement is inconsistent.',
        suggestedReview: ['passato prossimo'],
      },
    });

    const { evaluateExerciseAnswer } = await import('./AnswerEvaluation');
    const result = await evaluateExerciseAnswer({
      userId: '550e8400-e29b-41d4-a716-446655440001',
      exerciseId: '550e8400-e29b-41d4-a716-446655440010',
      answer: 'sono andata',
    });

    expect(result.evaluation.evaluationMethod).toBe('llm');
    expect(result.evaluation.score).toBe(78);
  });

  it('uses the llm for single-answer exercises', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(async () => [createExerciseRow({
          type: 'single_answer',
          exerciseData: {
            sampleAnswer: 'Parla di azioni concluse nel passato.',
            gradingCriteria: ['mentions completed action', 'uses clear Italian'],
          },
        })]),
      })),
    });
    mockCreateStructuredChatCompletion.mockResolvedValue({
      parsed: {
        score: 84,
        rubric: {
          accuracy: 34,
          grammar: 24,
          fluency: 18,
          bonus: 8,
        },
        overallFeedback: 'Accurate answer with minor phrasing issues.',
        suggestedReview: ['aspect contrast'],
      },
    });

    const { evaluateExerciseAnswer } = await import('./AnswerEvaluation');
    const result = await evaluateExerciseAnswer({
      userId: '550e8400-e29b-41d4-a716-446655440001',
      exerciseId: '550e8400-e29b-41d4-a716-446655440010',
      answer: 'Si usa per un azione finita.',
    });

    expect(result.evaluation.evaluationMethod).toBe('llm');
    expect(result.evaluation.score).toBe(84);
  });
});
