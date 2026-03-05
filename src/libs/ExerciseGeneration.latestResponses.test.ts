import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSelectDistinctOn = vi.fn();

vi.mock('./DB', () => ({
  db: {
    selectDistinctOn: mockSelectDistinctOn,
  },
}));

vi.mock('./Logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('listLatestResponsesForExercises', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns one latest row per exercise', async () => {
    mockSelectDistinctOn.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(async () => ([
            {
              id: '550e8400-e29b-41d4-a716-446655440020',
              exerciseId: '550e8400-e29b-41d4-a716-446655440010',
              score: 84,
              evaluationMethod: 'llm',
              rubric: {
                accuracy: 34,
                grammar: 24,
                fluency: 18,
                bonus: 8,
              },
              overallFeedback: 'Solid answer.',
              suggestedReview: ['agreement'],
              responseTimeMs: 16000,
              createdAt: new Date('2026-03-05T10:12:00.000Z'),
            },
            {
              id: '550e8400-e29b-41d4-a716-446655440021',
              exerciseId: '550e8400-e29b-41d4-a716-446655440011',
              score: 100,
              evaluationMethod: 'deterministic',
              rubric: {
                accuracy: 40,
                grammar: 30,
                fluency: 20,
                bonus: 10,
              },
              overallFeedback: 'Correct answer.',
              suggestedReview: [],
              responseTimeMs: null,
              createdAt: new Date('2026-03-05T10:15:00.000Z'),
            },
          ])),
        })),
      })),
    });

    const { listLatestResponsesForExercises } = await import('./ExerciseGeneration');
    const result = await listLatestResponsesForExercises('user-1', [
      '550e8400-e29b-41d4-a716-446655440010',
      '550e8400-e29b-41d4-a716-446655440011',
    ]);

    expect(result.size).toBe(2);
    expect(result.get('550e8400-e29b-41d4-a716-446655440010')?.score).toBe(84);
    expect(mockSelectDistinctOn).toHaveBeenCalledTimes(1);
  });
});
