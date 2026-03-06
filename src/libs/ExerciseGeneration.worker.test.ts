import { beforeEach, describe, expect, it, vi } from 'vitest';

type JobState = {
  id: string;
  userId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  exerciseType: 'multiple_choice' | 'fill_gap' | 'single_answer';
  documentIds: string[];
  requestedCount: number;
  generatedCount: number;
  failedCount: number;
  exerciseIds: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  topicFocus: string | null;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
};

type ChunkRow = {
  id: string;
  documentId: string;
  position: number;
};

type PineconeMatch = {
  metadata?: {
    document_id?: string;
    chunk_position?: number;
    text?: string;
  };
};

const state = {
  jobs: [] as JobState[],
  recoverPhase: 0,
  txSelectedId: null as string | null,
  chunkRows: [] as ChunkRow[],
  pineconeMatches: [] as PineconeMatch[],
  insertedExercises: [] as Array<{ id: string; values: Record<string, unknown> }>,
  nextExerciseId: 1,
  lastInsertedExerciseId: null as string | null,
};

const loggerInfoMock = vi.fn();
const loggerWarnMock = vi.fn();
const loggerErrorMock = vi.fn();
const loggerDebugMock = vi.fn();

const mockCreateEmbeddings = vi.fn(async () => ({
  embeddings: [[0.1]],
  usage: { promptTokens: 1, totalTokens: 1 },
}));
const mockCreateStructuredChatCompletion = vi.fn();
const mockCreateJsonChatCompletion = vi.fn();
const mockPineconeQuery = vi.fn(async () => ({ matches: state.pineconeMatches }));

let txLock = Promise.resolve();

function getActiveJob() {
  return state.jobs.find(job => job.status === 'processing')
    ?? state.jobs.find(job => job.id === state.txSelectedId)
    ?? null;
}

function applyJobUpdate(values: Record<string, unknown>) {
  if (values.errorMessage === 'WORKER_INTERRUPTED') {
    const now = new Date('2026-03-05T18:00:00.000Z');
    const stalePendingBefore = new Date(now.getTime() - 10 * 60 * 1000);
    const staleProcessingBefore = new Date(now.getTime() - 20 * 60 * 1000);

    const matching = state.jobs.filter((job) => {
      if (state.recoverPhase === 0) {
        return job.status === 'pending' && job.createdAt < stalePendingBefore;
      }

      if (job.status !== 'processing') {
        return false;
      }

      const baseline = job.startedAt ?? job.createdAt;
      return baseline < staleProcessingBefore;
    });

    for (const job of matching) {
      job.status = 'failed';
      job.errorMessage = 'WORKER_INTERRUPTED';
      job.completedAt = now;
    }

    state.recoverPhase += 1;
    return matching.map(job => ({ id: job.id }));
  }

  const activeJob = getActiveJob();
  if (!activeJob) {
    return [];
  }

  if (values.errorMessage === 'NO_CONTENT') {
    activeJob.status = 'failed';
    activeJob.errorMessage = 'NO_CONTENT';
    activeJob.completedAt = values.completedAt as Date ?? new Date('2026-03-05T18:00:00.000Z');
    return [];
  }

  if ('generatedCount' in values && 'exerciseIds' in values && !Array.isArray(values.exerciseIds)) {
    activeJob.generatedCount += 1;
    if (state.lastInsertedExerciseId) {
      activeJob.exerciseIds.push(state.lastInsertedExerciseId);
    }
    return [];
  }

  if ('failedCount' in values && !('status' in values)) {
    activeJob.failedCount += 1;
    return [];
  }

  if (values.status === 'completed' || values.status === 'failed') {
    activeJob.status = values.status;
    activeJob.errorMessage = (values.errorMessage as string | null | undefined) ?? null;
    activeJob.completedAt = values.completedAt as Date ?? null;

    if (typeof values.generatedCount === 'number') {
      activeJob.generatedCount = values.generatedCount;
    }

    if (typeof values.failedCount === 'number') {
      activeJob.failedCount = values.failedCount;
    }

    if (Array.isArray(values.exerciseIds)) {
      activeJob.exerciseIds = [...values.exerciseIds];
    }
  }

  return [];
}

function createMockTransactionClient() {
  return {
    execute: vi.fn(async () => {
      const nextPending = [...state.jobs]
        .filter(job => job.status === 'pending')
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      state.txSelectedId = nextPending?.id ?? null;

      if (!state.txSelectedId) {
        return { rows: [] };
      }

      return { rows: [{ id: state.txSelectedId }] };
    }),
    update: vi.fn(() => ({
      set: vi.fn((values: { status?: JobState['status']; startedAt?: Date; errorMessage?: string | null }) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            if (!state.txSelectedId || values.status !== 'processing' || !values.startedAt) {
              return [];
            }

            const job = state.jobs.find(item => item.id === state.txSelectedId);
            if (!job || job.status !== 'pending') {
              return [];
            }

            job.status = 'processing';
            job.startedAt = values.startedAt;
            job.errorMessage = values.errorMessage ?? null;

            return [{
              id: job.id,
              userId: job.userId,
              exerciseType: job.exerciseType,
              documentIds: [...job.documentIds],
              requestedCount: job.requestedCount,
              difficulty: job.difficulty,
              topicFocus: job.topicFocus,
            }];
          }),
        })),
      })),
    })),
  };
}

const mockDb = {
  transaction: vi.fn(async (callback: (tx: ReturnType<typeof createMockTransactionClient>) => Promise<unknown>) => {
    let release: (() => void) | undefined;
    const waitForTurn = txLock;
    txLock = new Promise<void>((resolve) => {
      release = resolve;
    });

    await waitForTurn;
    try {
      return await callback(createMockTransactionClient());
    } finally {
      release?.();
    }
  }),
  update: vi.fn(() => ({
    set: vi.fn((values: Record<string, unknown>) => ({
      where: vi.fn(() => {
        const rows = applyJobUpdate(values);

        return {
          returning: vi.fn(async () => rows),
        };
      }),
    })),
  })),
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(async () => state.chunkRows.map(row => ({
        id: row.id,
        documentId: row.documentId,
        position: row.position,
      }))),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn((values: Record<string, unknown>) => ({
      returning: vi.fn(async () => {
        const id = `exercise-${state.nextExerciseId}`;
        state.nextExerciseId += 1;
        state.lastInsertedExerciseId = id;
        state.insertedExercises.push({ id, values });

        return [{ id }];
      }),
    })),
  })),
};

vi.mock('./DB', () => ({
  db: mockDb,
}));

vi.mock('./Mistral', () => ({
  createEmbeddings: mockCreateEmbeddings,
  createStructuredChatCompletion: mockCreateStructuredChatCompletion,
  createJsonChatCompletion: mockCreateJsonChatCompletion,
}));

vi.mock('./Pinecone', () => ({
  getNamespacedIndex: () => ({
    query: mockPineconeQuery,
  }),
}));

vi.mock('./Logger', () => ({
  logger: {
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: loggerErrorMock,
    debug: loggerDebugMock,
  },
}));

vi.mock('./Env', () => ({
  Env: {
    MISTRAL_CHAT_REQUEST_DELAY_MS: 0,
    GENERATION_PENDING_STALE_MS: 10 * 60 * 1000,
    GENERATION_PROCESSING_STALE_MS: 20 * 60 * 1000,
  },
}));

function createJob(input: Partial<JobState> & { id: string; createdAt: Date }): JobState {
  return {
    id: input.id,
    userId: input.userId ?? '550e8400-e29b-41d4-a716-446655440001',
    status: input.status ?? 'pending',
    exerciseType: input.exerciseType ?? 'multiple_choice',
    documentIds: input.documentIds ?? ['550e8400-e29b-41d4-a716-446655440010'],
    requestedCount: input.requestedCount ?? 1,
    generatedCount: input.generatedCount ?? 0,
    failedCount: input.failedCount ?? 0,
    exerciseIds: input.exerciseIds ?? [],
    difficulty: input.difficulty ?? null,
    topicFocus: input.topicFocus ?? null,
    errorMessage: input.errorMessage ?? null,
    createdAt: input.createdAt,
    startedAt: input.startedAt ?? null,
    completedAt: input.completedAt ?? null,
  };
}

function setReadyChunks(input?: {
  documentId?: string;
  texts?: string[];
}) {
  const documentId = input?.documentId ?? '550e8400-e29b-41d4-a716-446655440010';
  const texts = input?.texts ?? ['Va subito a casa.'];

  state.chunkRows = texts.map((_, index) => ({
    id: `chunk-${index + 1}`,
    documentId,
    position: index,
  }));
  state.pineconeMatches = texts.map((text, index) => ({
    metadata: {
      document_id: documentId,
      chunk_position: index,
      text,
    },
  }));
}

describe('runGenerationWorkerBatch', () => {
  beforeEach(() => {
    state.jobs = [];
    state.recoverPhase = 0;
    state.txSelectedId = null;
    state.chunkRows = [];
    state.pineconeMatches = [];
    state.insertedExercises = [];
    state.nextExerciseId = 1;
    state.lastInsertedExerciseId = null;
    txLock = Promise.resolve();

    mockCreateStructuredChatCompletion.mockReset();
    mockCreateJsonChatCompletion.mockReset();
    mockCreateEmbeddings.mockClear();
    mockPineconeQuery.mockClear();
    vi.clearAllMocks();
  });

  it('marks stale pending and processing jobs with status-specific baselines', async () => {
    state.jobs = [
      createJob({ id: 'job-pending-stale', status: 'pending', createdAt: new Date('2026-03-05T17:49:59.000Z') }),
      createJob({
        id: 'job-processing-stale-started',
        status: 'processing',
        createdAt: new Date('2026-03-05T17:59:00.000Z'),
        startedAt: new Date('2026-03-05T17:39:59.000Z'),
      }),
      createJob({
        id: 'job-processing-stale-legacy',
        status: 'processing',
        createdAt: new Date('2026-03-05T17:39:59.000Z'),
        startedAt: null,
      }),
      createJob({
        id: 'job-processing-active',
        status: 'processing',
        createdAt: new Date('2026-03-05T17:00:00.000Z'),
        startedAt: new Date('2026-03-05T17:55:00.000Z'),
      }),
    ];

    const { runGenerationWorkerBatch } = await import('./ExerciseGeneration');
    const result = await runGenerationWorkerBatch({ maxJobs: 1 });

    expect(result.claimed).toBe(0);
    expect(state.jobs.find(job => job.id === 'job-pending-stale')?.status).toBe('failed');
    expect(state.jobs.find(job => job.id === 'job-processing-stale-started')?.status).toBe('failed');
    expect(state.jobs.find(job => job.id === 'job-processing-stale-legacy')?.status).toBe('failed');
    expect(state.jobs.find(job => job.id === 'job-processing-active')?.status).toBe('processing');
  });

  it('claims one pending job across concurrent batches', async () => {
    state.jobs = [
      createJob({ id: 'job-pending-1', status: 'pending', createdAt: new Date('2026-03-05T17:59:00.000Z') }),
    ];

    const { runGenerationWorkerBatch } = await import('./ExerciseGeneration');
    const [first, second] = await Promise.all([
      runGenerationWorkerBatch({ maxJobs: 1 }),
      runGenerationWorkerBatch({ maxJobs: 1 }),
    ]);

    expect(first.claimed + second.claimed).toBe(1);
    expect(state.jobs.filter(job => job.status === 'pending')).toHaveLength(0);
  });

  it('respects maxJobs and leaves remaining jobs pending', async () => {
    state.jobs = [
      createJob({ id: 'job-pending-a', status: 'pending', createdAt: new Date('2026-03-05T17:58:00.000Z') }),
      createJob({ id: 'job-pending-b', status: 'pending', createdAt: new Date('2026-03-05T17:59:00.000Z') }),
      createJob({ id: 'job-pending-c', status: 'pending', createdAt: new Date('2026-03-05T18:00:00.000Z') }),
    ];

    const { runGenerationWorkerBatch } = await import('./ExerciseGeneration');
    const result = await runGenerationWorkerBatch({ maxJobs: 2 });

    expect(result.claimed).toBe(2);
    expect(state.jobs.filter(job => job.status === 'pending')).toHaveLength(1);
  });

  it('claims remaining pending jobs in a later batch run', async () => {
    state.jobs = [
      createJob({ id: 'job-pending-a', status: 'pending', createdAt: new Date('2026-03-05T17:58:00.000Z') }),
      createJob({ id: 'job-pending-b', status: 'pending', createdAt: new Date('2026-03-05T17:59:00.000Z') }),
    ];

    const { runGenerationWorkerBatch } = await import('./ExerciseGeneration');
    const first = await runGenerationWorkerBatch({ maxJobs: 1 });
    const second = await runGenerationWorkerBatch({ maxJobs: 1 });

    expect(first.claimed).toBe(1);
    expect(second.claimed).toBe(1);
    expect(state.jobs.filter(job => job.status === 'pending')).toHaveLength(0);
  });

  it('logs schema mismatch when fallback JSON omits nested exerciseData', async () => {
    state.jobs = [
      createJob({
        id: 'job-invalid-flat',
        requestedCount: 1,
        createdAt: new Date('2026-03-05T17:59:00.000Z'),
      }),
    ];
    setReadyChunks();

    mockCreateStructuredChatCompletion.mockRejectedValue(new Error('Mistral structured output parsing failed'));
    mockCreateJsonChatCompletion.mockResolvedValue(JSON.stringify({
      exercises: [{
        type: 'multiple_choice',
        question: 'Quale forma e corretta?',
        options: ['vai', 'vada', 'andiamo', 'vanno'],
        correctIndex: 0,
        sourceReferences: [{
          documentId: '550e8400-e29b-41d4-a716-446655440010',
          chunkPosition: 0,
        }],
      }],
    }));

    const { runGenerationWorkerBatch } = await import('./ExerciseGeneration');
    const result = await runGenerationWorkerBatch({ maxJobs: 1 });

    expect(result.failed).toBe(1);
    expect(state.jobs[0]?.status).toBe('failed');
    expect(state.jobs[0]?.errorMessage).toBe('GENERATION_FAILED');
    expect(state.jobs[0]?.failedCount).toBe(1);
    expect(loggerWarnMock.mock.calls).toEqual(expect.arrayContaining([
      [
        'exercise_generation_structured_failed',
        expect.objectContaining({
          jobId: 'job-invalid-flat',
          attempt: 1,
          failureKind: 'unparsable_response',
          errorMessage: 'Mistral structured output parsing failed',
        }),
      ],
      [
        'exercise_generation_json_validation_failed',
        expect.objectContaining({
          jobId: 'job-invalid-flat',
          attempt: 1,
          rawContentExcerpt: expect.stringContaining('"options"'),
          issues: expect.arrayContaining([
            expect.objectContaining({
              path: 'exercises.0.exerciseData',
            }),
          ]),
        }),
      ],
    ]));
  });

  it('completes a job when the model returns nested exerciseData', async () => {
    state.jobs = [
      createJob({
        id: 'job-valid-nested',
        requestedCount: 1,
        createdAt: new Date('2026-03-05T17:59:00.000Z'),
      }),
    ];
    setReadyChunks();

    mockCreateStructuredChatCompletion.mockResolvedValue({
      parsed: {
        exercises: [{
          type: 'multiple_choice',
          question: 'Quale forma e corretta?',
          sourceReferences: [{
            documentId: '550e8400-e29b-41d4-a716-446655440010',
            chunkPosition: 0,
          }],
          exerciseData: {
            options: ['vai', 'vada', 'andiamo', 'vanno'],
            correctIndex: 0,
          },
        }],
      },
      rawContent: null,
      usage: { promptTokens: 1, totalTokens: 1 },
    });

    const { runGenerationWorkerBatch } = await import('./ExerciseGeneration');
    const result = await runGenerationWorkerBatch({ maxJobs: 1 });

    expect(result.completed).toBe(1);
    expect(state.jobs[0]?.status).toBe('completed');
    expect(state.jobs[0]?.generatedCount).toBe(1);
    expect(state.jobs[0]?.failedCount).toBe(0);
    expect(state.jobs[0]?.exerciseIds).toEqual(['exercise-1']);
    expect(state.insertedExercises).toHaveLength(1);
    expect(mockCreateJsonChatCompletion).not.toHaveBeenCalled();
  });

  it('marks every exercise attempt failed when invalid fallback output repeats', async () => {
    state.jobs = [
      createJob({
        id: 'job-repeated-invalid',
        requestedCount: 2,
        createdAt: new Date('2026-03-05T17:59:00.000Z'),
      }),
    ];
    setReadyChunks();

    mockCreateStructuredChatCompletion.mockRejectedValue(new Error('Mistral structured output parsing failed'));
    mockCreateJsonChatCompletion.mockResolvedValue(JSON.stringify({
      exercises: [{
        type: 'multiple_choice',
        question: 'Quale forma e corretta?',
        options: ['vai', 'vada', 'andiamo', 'vanno'],
        correctIndex: 0,
        sourceReferences: [{
          documentId: '550e8400-e29b-41d4-a716-446655440010',
          chunkPosition: 0,
        }],
      }],
    }));

    const { runGenerationWorkerBatch } = await import('./ExerciseGeneration');
    const result = await runGenerationWorkerBatch({ maxJobs: 1 });

    expect(result.failed).toBe(1);
    expect(state.jobs[0]?.status).toBe('failed');
    expect(state.jobs[0]?.errorMessage).toBe('GENERATION_FAILED');
    expect(state.jobs[0]?.generatedCount).toBe(0);
    expect(state.jobs[0]?.failedCount).toBe(2);
    expect(mockCreateJsonChatCompletion).toHaveBeenCalledTimes(6);
  });

  it('retries duplicate generated questions within one job until the question changes', async () => {
    state.jobs = [
      createJob({
        id: 'job-duplicate-question-retry',
        requestedCount: 2,
        createdAt: new Date('2026-03-05T17:59:00.000Z'),
      }),
    ];
    setReadyChunks({
      texts: [
        'Va subito a casa.',
        'Prendi il quaderno.',
        'Scrivi la risposta.',
      ],
    });

    mockCreateStructuredChatCompletion
      .mockResolvedValueOnce({
        parsed: {
          exercises: [{
            type: 'multiple_choice',
            question: 'Quale forma e corretta?',
            sourceReferences: [{
              documentId: '550e8400-e29b-41d4-a716-446655440010',
              chunkPosition: 0,
            }],
            exerciseData: {
              options: ['vai', 'vada', 'andiamo', 'vanno'],
              correctIndex: 0,
            },
          }],
        },
        rawContent: null,
        usage: { promptTokens: 1, totalTokens: 1 },
      })
      .mockResolvedValueOnce({
        parsed: {
          exercises: [{
            type: 'multiple_choice',
            question: 'Quale forma e corretta?',
            sourceReferences: [{
              documentId: '550e8400-e29b-41d4-a716-446655440010',
              chunkPosition: 1,
            }],
            exerciseData: {
              options: ['prendi', 'prenda', 'prendete', 'prendono'],
              correctIndex: 0,
            },
          }],
        },
        rawContent: null,
        usage: { promptTokens: 1, totalTokens: 1 },
      })
      .mockResolvedValueOnce({
        parsed: {
          exercises: [{
            type: 'multiple_choice',
            question: 'Quale forma imperativa usa il verbo prendere per tu?',
            sourceReferences: [{
              documentId: '550e8400-e29b-41d4-a716-446655440010',
              chunkPosition: 1,
            }],
            exerciseData: {
              options: ['prendi', 'prenda', 'prendete', 'prendono'],
              correctIndex: 0,
            },
          }],
        },
        rawContent: null,
        usage: { promptTokens: 1, totalTokens: 1 },
      });

    const { runGenerationWorkerBatch } = await import('./ExerciseGeneration');
    const result = await runGenerationWorkerBatch({ maxJobs: 1 });

    expect(result.completed).toBe(1);
    expect(state.jobs[0]?.status).toBe('completed');
    expect(state.jobs[0]?.generatedCount).toBe(2);
    expect(state.insertedExercises).toHaveLength(2);
    expect(state.insertedExercises.map(item => item.values.question)).toEqual([
      'Quale forma e corretta?',
      'Quale forma imperativa usa il verbo prendere per tu?',
    ]);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'exercise_generation_attempt_failed',
      expect.objectContaining({
        jobId: 'job-duplicate-question-retry',
        attempt: 1,
        error: expect.any(Error),
      }),
    );
  });

  it('completes with distinct questions even when excerpts overlap', async () => {
    state.jobs = [
      createJob({
        id: 'job-overlap-success',
        requestedCount: 2,
        createdAt: new Date('2026-03-05T17:59:00.000Z'),
      }),
    ];
    setReadyChunks({
      texts: [
        'Va subito a casa.',
        'Prendi il quaderno.',
      ],
    });

    mockCreateStructuredChatCompletion
      .mockResolvedValueOnce({
        parsed: {
          exercises: [{
            type: 'multiple_choice',
            question: 'Qual e la forma corretta di andare per tu?',
            sourceReferences: [{
              documentId: '550e8400-e29b-41d4-a716-446655440010',
              chunkPosition: 0,
            }],
            exerciseData: {
              options: ['vai', 'vada', 'andiamo', 'vanno'],
              correctIndex: 0,
            },
          }],
        },
        rawContent: null,
        usage: { promptTokens: 1, totalTokens: 1 },
      })
      .mockResolvedValueOnce({
        parsed: {
          exercises: [{
            type: 'multiple_choice',
            question: 'Qual e la forma corretta di prendere per tu?',
            sourceReferences: [{
              documentId: '550e8400-e29b-41d4-a716-446655440010',
              chunkPosition: 1,
            }],
            exerciseData: {
              options: ['prendi', 'prenda', 'prendete', 'prendono'],
              correctIndex: 0,
            },
          }],
        },
        rawContent: null,
        usage: { promptTokens: 1, totalTokens: 1 },
      });

    const { runGenerationWorkerBatch } = await import('./ExerciseGeneration');
    const result = await runGenerationWorkerBatch({ maxJobs: 1 });

    expect(result.completed).toBe(1);
    expect(state.jobs[0]?.status).toBe('completed');
    expect(state.jobs[0]?.generatedCount).toBe(2);
    expect(state.jobs[0]?.failedCount).toBe(0);
    expect(state.insertedExercises).toHaveLength(2);
  });
});
