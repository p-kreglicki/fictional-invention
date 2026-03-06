import { beforeEach, describe, expect, it, vi } from 'vitest';

type StoredExercise = {
  id: string;
  userId: string;
  timesAttempted: number;
  averageScore: number | null;
};

type StoredResponse = {
  id: string;
  exerciseId: string;
  userId: string;
  score: number;
  rubric: {
    accuracy: number;
    grammar: number;
    fluency: number;
    bonus: number;
  };
  overallFeedback: string;
  suggestedReview: string[];
  responseTimeMs: number | null;
  createdAt: Date;
  evaluationMethod: 'deterministic' | 'llm';
};

const state = {
  exercises: new Map<string, StoredExercise>(),
  responses: [] as StoredResponse[],
  lockOrder: [] as string[],
  insertOrder: [] as string[],
};

const exerciseLocks = new Map<string, Promise<void>>();

function resetState() {
  state.exercises = new Map();
  state.responses = [];
  state.lockOrder = [];
  state.insertOrder = [];
  exerciseLocks.clear();
}

function createLock(exerciseId: string) {
  let release: (() => void) | undefined;
  const waitForTurn = exerciseLocks.get(exerciseId) ?? Promise.resolve();
  const nextTurn = new Promise<void>((resolve) => {
    release = resolve;
  });
  exerciseLocks.set(exerciseId, nextTurn);

  return {
    waitForTurn,
    release: () => {
      release?.();
      if (exerciseLocks.get(exerciseId) === nextTurn) {
        exerciseLocks.delete(exerciseId);
      }
    },
  };
}

function roundAverage(scores: number[]) {
  if (scores.length === 0) {
    return null;
  }

  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function buildResponseId(index: number) {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function createMockTransactionClient() {
  let releaseExerciseLock: (() => void) | null = null;
  let lockedExerciseId: string | null = null;

  return {
    execute: vi.fn(async () => {
      const [exercise] = Array.from(state.exercises.values());
      if (!exercise) {
        return { rows: [] };
      }

      const lock = createLock(exercise.id);
      await lock.waitForTurn;
      releaseExerciseLock = lock.release;
      lockedExerciseId = exercise.id;
      state.lockOrder.push(exercise.id);

      return { rows: [{ id: exercise.id }] };
    }),
    insert: vi.fn(() => ({
      values: vi.fn((values: {
        userId: string;
        exerciseId: string;
        score: number;
        evaluationMethod: StoredResponse['evaluationMethod'];
        rubric: StoredResponse['rubric'];
        overallFeedback: string;
        suggestedReview: string[];
        responseTimeMs?: number;
      }) => ({
        returning: vi.fn(async () => {
          if (lockedExerciseId !== values.exerciseId) {
            throw new Error('insert_without_lock');
          }

          const response: StoredResponse = {
            id: buildResponseId(state.responses.length + 1),
            exerciseId: values.exerciseId,
            userId: values.userId,
            score: values.score,
            evaluationMethod: values.evaluationMethod,
            rubric: values.rubric,
            overallFeedback: values.overallFeedback,
            suggestedReview: values.suggestedReview,
            responseTimeMs: values.responseTimeMs ?? null,
            createdAt: new Date(`2026-03-06T10:00:0${state.responses.length}.000Z`),
          };

          state.insertOrder.push(response.id);
          state.responses.push(response);

          return [{
            id: response.id,
            exerciseId: response.exerciseId,
            score: response.score,
            evaluationMethod: response.evaluationMethod,
            rubric: response.rubric,
            overallFeedback: response.overallFeedback,
            suggestedReview: response.suggestedReview,
            responseTimeMs: response.responseTimeMs,
            createdAt: response.createdAt,
          }];
        }),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => {
          const scores = state.responses
            .filter(response => response.exerciseId === lockedExerciseId)
            .map(response => response.score);

          return [{
            timesAttempted: scores.length,
            averageScore: roundAverage(scores),
          }];
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: { timesAttempted: number; averageScore: number | null }) => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            const exercise = lockedExerciseId ? state.exercises.get(lockedExerciseId) : null;
            if (!exercise) {
              return [];
            }

            exercise.timesAttempted = values.timesAttempted;
            exercise.averageScore = values.averageScore;

            return [{
              timesAttempted: exercise.timesAttempted,
              averageScore: exercise.averageScore,
            }];
          }),
        })),
      })),
    })),
    __release: () => {
      releaseExerciseLock?.();
      releaseExerciseLock = null;
      lockedExerciseId = null;
    },
  };
}

const mockDb = {
  transaction: vi.fn(async (callback: (tx: ReturnType<typeof createMockTransactionClient>) => Promise<unknown>) => {
    const tx = createMockTransactionClient();

    try {
      return await callback(tx);
    } finally {
      tx.__release();
    }
  }),
};

vi.mock('./DB', () => ({
  db: mockDb,
}));

describe('recordExerciseResponse', () => {
  beforeEach(() => {
    resetState();
    vi.clearAllMocks();
  });

  it('serializes concurrent submissions for the same exercise', async () => {
    const exerciseId = '550e8400-e29b-41d4-a716-446655440000';
    state.exercises.set(exerciseId, {
      id: exerciseId,
      userId: '550e8400-e29b-41d4-a716-446655440010',
      timesAttempted: 0,
      averageScore: null,
    });

    const { recordExerciseResponse } = await import('./ResponseSubmission');

    const first = recordExerciseResponse({
      userId: '550e8400-e29b-41d4-a716-446655440010',
      exerciseId,
      clientSubmissionId: '550e8400-e29b-41d4-a716-446655440001',
      answer: 'uno',
      evaluation: {
        score: 80,
        rubric: { accuracy: 30, grammar: 20, fluency: 20, bonus: 10 },
        overallFeedback: 'Good answer.',
        suggestedReview: [],
        evaluationMethod: 'deterministic',
      },
    });

    const second = recordExerciseResponse({
      userId: '550e8400-e29b-41d4-a716-446655440010',
      exerciseId,
      clientSubmissionId: '550e8400-e29b-41d4-a716-446655440002',
      answer: 'due',
      evaluation: {
        score: 100,
        rubric: { accuracy: 40, grammar: 30, fluency: 20, bonus: 10 },
        overallFeedback: 'Correct answer.',
        suggestedReview: [],
        evaluationMethod: 'deterministic',
      },
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.exerciseStats).toEqual({
      timesAttempted: 1,
      averageScore: 80,
    });
    expect(secondResult.exerciseStats).toEqual({
      timesAttempted: 2,
      averageScore: 90,
    });
    expect(state.exercises.get(exerciseId)).toMatchObject({
      timesAttempted: 2,
      averageScore: 90,
    });
    expect(state.responses).toHaveLength(2);
    expect(state.lockOrder).toEqual([exerciseId, exerciseId]);
  });

  it('locks the exercise row before inserting the response', async () => {
    const exerciseId = '550e8400-e29b-41d4-a716-446655440000';
    state.exercises.set(exerciseId, {
      id: exerciseId,
      userId: '550e8400-e29b-41d4-a716-446655440010',
      timesAttempted: 0,
      averageScore: null,
    });

    const { recordExerciseResponse } = await import('./ResponseSubmission');

    await recordExerciseResponse({
      userId: '550e8400-e29b-41d4-a716-446655440010',
      exerciseId,
      clientSubmissionId: '550e8400-e29b-41d4-a716-446655440001',
      answer: 'uno',
      evaluation: {
        score: 80,
        rubric: { accuracy: 30, grammar: 20, fluency: 20, bonus: 10 },
        overallFeedback: 'Good answer.',
        suggestedReview: [],
        evaluationMethod: 'deterministic',
      },
    });

    expect(state.lockOrder).toEqual([exerciseId]);
    expect(state.insertOrder).toEqual([buildResponseId(1)]);
  });

  it('throws when the exercise row cannot be locked', async () => {
    const { recordExerciseResponse } = await import('./ResponseSubmission');
    const { ExerciseNotFoundError } = await import('./AnswerEvaluation');

    await expect(recordExerciseResponse({
      userId: '550e8400-e29b-41d4-a716-446655440010',
      exerciseId: '550e8400-e29b-41d4-a716-446655440000',
      clientSubmissionId: '550e8400-e29b-41d4-a716-446655440001',
      answer: 'uno',
      evaluation: {
        score: 80,
        rubric: { accuracy: 30, grammar: 20, fluency: 20, bonus: 10 },
        overallFeedback: 'Good answer.',
        suggestedReview: [],
        evaluationMethod: 'deterministic',
      },
    })).rejects.toBeInstanceOf(ExerciseNotFoundError);

    expect(state.responses).toHaveLength(0);
  });
});
