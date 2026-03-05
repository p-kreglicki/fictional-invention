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

const state = {
  jobs: [] as JobState[],
  recoverPhase: 0,
  txSelectedId: null as string | null,
};

let txLock = Promise.resolve();

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
    set: vi.fn((values: { status?: JobState['status']; errorMessage?: string; completedAt?: Date }) => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => {
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

          if (values.errorMessage === 'NO_CONTENT') {
            const processingJob = state.jobs.find(job => job.status === 'processing');
            if (processingJob) {
              processingJob.status = 'failed';
              processingJob.errorMessage = 'NO_CONTENT';
              processingJob.completedAt = values.completedAt ?? new Date('2026-03-05T18:00:00.000Z');
            }
          }

          return [];
        }),
      })),
    })),
  })),
};

vi.mock('./DB', () => ({
  db: mockDb,
}));

vi.mock('./Mistral', () => ({
  createEmbeddings: vi.fn(async () => ({ embeddings: [[0.1]], usage: { promptTokens: 1, totalTokens: 1 } })),
  createStructuredChatCompletion: vi.fn(),
  createJsonChatCompletion: vi.fn(),
}));

vi.mock('./Pinecone', () => ({
  getNamespacedIndex: () => ({
    query: vi.fn(async () => ({ matches: [] })),
  }),
}));

vi.mock('./Logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
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

describe('runGenerationWorkerBatch', () => {
  beforeEach(() => {
    state.jobs = [];
    state.recoverPhase = 0;
    state.txSelectedId = null;
    txLock = Promise.resolve();
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
});
