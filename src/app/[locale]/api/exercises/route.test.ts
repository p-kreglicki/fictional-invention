import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireUser = vi.fn(async () => ({ id: 'user-1' }));
const mockListRecentExercises = vi.fn();
const mockListActiveGenerationJobs = vi.fn();
const mockListLatestResponsesForExercises = vi.fn();

vi.mock('@/libs/Auth', () => ({
  requireUser: mockRequireUser,
}));

vi.mock('@/libs/ExerciseGeneration', () => ({
  listRecentExercises: mockListRecentExercises,
  listActiveGenerationJobs: mockListActiveGenerationJobs,
  listLatestResponsesForExercises: mockListLatestResponsesForExercises,
}));

vi.mock('@/libs/Logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('GET /api/exercises', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns exercises and active jobs', async () => {
    mockListRecentExercises.mockResolvedValue([{
      id: '550e8400-e29b-41d4-a716-446655440010',
      type: 'single_answer',
      difficulty: 'intermediate',
      question: 'Spiega la frase',
      exerciseData: {
        sampleAnswer: 'Risposta',
        gradingCriteria: ['correttezza'],
      },
      grammarFocus: 'congiuntivo',
      timesAttempted: 2,
      averageScore: 84,
      createdAt: new Date('2026-03-05T10:10:00.000Z'),
    }]);
    mockListLatestResponsesForExercises.mockResolvedValue(new Map([
      ['550e8400-e29b-41d4-a716-446655440010', {
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
      }],
    ]));

    mockListActiveGenerationJobs.mockResolvedValue([{
      id: 'job-1',
      status: 'processing',
      requestedCount: 3,
      generatedCount: 1,
      failedCount: 0,
      errorMessage: null,
      createdAt: new Date('2026-03-05T10:00:00.000Z'),
      startedAt: new Date('2026-03-05T10:00:02.000Z'),
      completedAt: null,
    }]);

    const { GET } = await import('./route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.exercises).toHaveLength(1);
    expect(body.activeJobs).toHaveLength(1);
    expect(body.exercises[0].renderData.gradingCriteria).toEqual(['correttezza']);
    expect(body.exercises[0].latestResponse.score).toBe(84);
    expect(body.exercises[0].renderData.sampleAnswer).toBeUndefined();
  });
});
