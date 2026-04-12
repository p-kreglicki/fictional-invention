import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireUser = vi.fn(async () => ({ id: 'user-1' }));
const mockListRecentGenerationSets = vi.fn();
const mockListActiveGenerationJobs = vi.fn();

vi.mock('@/libs/Auth', () => ({
  requireUser: mockRequireUser,
}));

vi.mock('@/libs/ExerciseGeneration', () => ({
  listRecentGenerationSets: mockListRecentGenerationSets,
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

  it('returns grouped exercise sets and hides duplicated active jobs', async () => {
    mockListRecentGenerationSets.mockResolvedValue([{
      job: {
        id: '550e8400-e29b-41d4-a716-446655440002',
        status: 'completed',
        requestedCount: 2,
        generatedCount: 2,
        failedCount: 0,
        errorMessage: null,
        exerciseType: 'single_answer',
        documentIds: ['550e8400-e29b-41d4-a716-446655440100'],
        difficulty: 'intermediate',
        topicFocus: 'congiuntivo',
        exerciseIds: ['550e8400-e29b-41d4-a716-446655440010'],
        createdAt: new Date('2026-03-05T10:00:00.000Z'),
        startedAt: new Date('2026-03-05T10:00:02.000Z'),
        completedAt: new Date('2026-03-05T10:00:10.000Z'),
      },
      exercises: [{
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
      }],
      sourceDocuments: [{
        id: '550e8400-e29b-41d4-a716-446655440100',
        title: 'Lesson notes',
      }],
      latestResponsesByExerciseId: new Map([
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
      ]),
    }]);

    mockListActiveGenerationJobs.mockResolvedValue([
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        status: 'processing',
        requestedCount: 2,
        generatedCount: 1,
        failedCount: 0,
        errorMessage: null,
        exerciseType: 'single_answer',
        difficulty: 'intermediate',
        topicFocus: 'congiuntivo',
        createdAt: new Date('2026-03-05T10:00:00.000Z'),
        startedAt: new Date('2026-03-05T10:00:02.000Z'),
        completedAt: null,
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440003',
        status: 'pending',
        requestedCount: 3,
        generatedCount: 0,
        failedCount: 0,
        errorMessage: null,
        exerciseType: 'multiple_choice',
        difficulty: null,
        topicFocus: null,
        createdAt: new Date('2026-03-05T10:15:00.000Z'),
        startedAt: null,
        completedAt: null,
      },
    ]);

    const { GET } = await import('./route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sets).toHaveLength(1);
    expect(body.activeJobs).toHaveLength(1);
    expect(body.sets[0].sourceDocuments).toEqual([{
      id: '550e8400-e29b-41d4-a716-446655440100',
      title: 'Lesson notes',
    }]);
    expect(body.sets[0].exercises[0].renderData.gradingCriteria).toEqual(['correttezza']);
    expect(body.sets[0].exercises[0].latestResponse.score).toBe(84);
    expect(body.sets[0].exercises[0].renderData.sampleAnswer).toBeUndefined();
    expect(body.activeJobs[0].id).toBe('550e8400-e29b-41d4-a716-446655440003');
  });

  it('skips malformed exercises inside grouped sets instead of returning 500', async () => {
    mockListRecentGenerationSets.mockResolvedValue([{
      job: {
        id: '550e8400-e29b-41d4-a716-446655440002',
        status: 'completed',
        requestedCount: 2,
        generatedCount: 2,
        failedCount: 0,
        errorMessage: null,
        exerciseType: 'multiple_choice',
        documentIds: [],
        difficulty: 'beginner',
        topicFocus: null,
        exerciseIds: [
          '550e8400-e29b-41d4-a716-446655440010',
          '550e8400-e29b-41d4-a716-446655440011',
        ],
        createdAt: new Date('2026-03-05T10:00:00.000Z'),
        startedAt: new Date('2026-03-05T10:00:02.000Z'),
        completedAt: new Date('2026-03-05T10:00:10.000Z'),
      },
      exercises: [
        {
          id: '550e8400-e29b-41d4-a716-446655440010',
          type: 'multiple_choice',
          difficulty: 'beginner',
          question: 'Quale forma e corretta?',
          exerciseData: {
            options: ['andava', 'andava', 'andava', 'andava'],
            correctIndex: 0,
          },
          grammarFocus: 'imperfetto',
          timesAttempted: 0,
          averageScore: null,
          createdAt: new Date('2026-03-05T10:10:00.000Z'),
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440011',
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
          createdAt: new Date('2026-03-05T10:11:00.000Z'),
        },
      ],
      sourceDocuments: [],
      latestResponsesByExerciseId: new Map(),
    }]);
    mockListActiveGenerationJobs.mockResolvedValue([]);

    const { GET } = await import('./route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sets).toHaveLength(1);
    expect(body.sets[0].exercises).toHaveLength(1);
    expect(body.sets[0].exercises[0].id).toBe('550e8400-e29b-41d4-a716-446655440011');
  });
});
