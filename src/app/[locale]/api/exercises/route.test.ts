import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireUser = vi.fn(async () => ({ id: 'user-1' }));
const mockListRecentExercises = vi.fn();
const mockListActiveGenerationJobs = vi.fn();

vi.mock('@/libs/Auth', () => ({
  requireUser: mockRequireUser,
}));

vi.mock('@/libs/ExerciseGeneration', () => ({
  listRecentExercises: mockListRecentExercises,
  listActiveGenerationJobs: mockListActiveGenerationJobs,
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
      id: 'exercise-1',
      type: 'single_answer',
      difficulty: 'intermediate',
      question: 'Spiega la frase',
      exerciseData: {
        sampleAnswer: 'Risposta',
        gradingCriteria: ['correttezza'],
      },
      sourceChunkIds: ['chunk-1'],
      grammarFocus: 'congiuntivo',
      createdAt: new Date('2026-03-05T10:10:00.000Z'),
    }]);

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
  });
});
