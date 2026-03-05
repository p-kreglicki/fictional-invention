import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireUser = vi.fn(async () => ({ id: 'user-1' }));
const mockGetGenerationJobWithExercises = vi.fn();

vi.mock('@/libs/Auth', () => ({
  requireUser: mockRequireUser,
}));

vi.mock('@/libs/ExerciseGeneration', () => ({
  getGenerationJobWithExercises: mockGetGenerationJobWithExercises,
}));

vi.mock('@/libs/Logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('GET /api/exercises/jobs/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 for unknown jobs', async () => {
    mockGetGenerationJobWithExercises.mockResolvedValue(null);

    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'job-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('JOB_NOT_FOUND');
  });

  it('returns 404 for malformed job IDs', async () => {
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('JOB_NOT_FOUND');
    expect(mockGetGenerationJobWithExercises).not.toHaveBeenCalled();
  });

  it('returns job status and exercises', async () => {
    mockGetGenerationJobWithExercises.mockResolvedValue({
      job: {
        id: '550e8400-e29b-41d4-a716-446655440002',
        status: 'completed',
        requestedCount: 2,
        generatedCount: 2,
        failedCount: 0,
        errorMessage: null,
        createdAt: new Date('2026-03-05T10:00:00.000Z'),
        startedAt: new Date('2026-03-05T10:00:02.000Z'),
        completedAt: new Date('2026-03-05T10:00:10.000Z'),
      },
      exercises: [{
        id: 'exercise-1',
        type: 'multiple_choice',
        difficulty: 'beginner',
        question: 'Domanda',
        exerciseData: {
          options: ['a', 'b', 'c', 'd'],
          correctIndex: 1,
        },
        sourceChunkIds: ['chunk-1'],
        grammarFocus: null,
        createdAt: new Date('2026-03-05T10:00:10.000Z'),
      }],
    });

    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ id: '550e8400-e29b-41d4-a716-446655440002' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe('550e8400-e29b-41d4-a716-446655440002');
    expect(body.status).toBe('completed');
    expect(body.exercises).toHaveLength(1);
  });
});
