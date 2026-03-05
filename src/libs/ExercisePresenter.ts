import * as z from 'zod';
import {
  ExerciseCardSchema,
  ExerciseLatestResponseSchema,
} from '@/validations/ResponseValidation';

const StoredMultipleChoiceDataSchema = z.object({
  options: z.array(z.string().trim().min(1)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(1).optional(),
});

const StoredFillGapDataSchema = z.object({
  answer: z.string().trim().min(1),
  acceptedAnswers: z.array(z.string().trim().min(1)).min(1).max(5).optional(),
  hint: z.string().trim().min(1).optional(),
});

const StoredSingleAnswerDataSchema = z.object({
  sampleAnswer: z.string().trim().min(1),
  gradingCriteria: z.array(z.string().trim().min(1)).min(1).max(8),
});

const StoredExerciseSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.uuid(),
    type: z.literal('multiple_choice'),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).nullable(),
    question: z.string().trim().min(1),
    exerciseData: StoredMultipleChoiceDataSchema,
    grammarFocus: z.string().trim().min(1).nullable(),
    timesAttempted: z.number().int().nonnegative().nullable().optional(),
    averageScore: z.number().int().min(0).max(100).nullable().optional(),
    createdAt: z.date(),
  }),
  z.object({
    id: z.uuid(),
    type: z.literal('fill_gap'),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).nullable(),
    question: z.string().trim().min(1),
    exerciseData: StoredFillGapDataSchema,
    grammarFocus: z.string().trim().min(1).nullable(),
    timesAttempted: z.number().int().nonnegative().nullable().optional(),
    averageScore: z.number().int().min(0).max(100).nullable().optional(),
    createdAt: z.date(),
  }),
  z.object({
    id: z.uuid(),
    type: z.literal('single_answer'),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).nullable(),
    question: z.string().trim().min(1),
    exerciseData: StoredSingleAnswerDataSchema,
    grammarFocus: z.string().trim().min(1).nullable(),
    timesAttempted: z.number().int().nonnegative().nullable().optional(),
    averageScore: z.number().int().min(0).max(100).nullable().optional(),
    createdAt: z.date(),
  }),
]);

const StoredLatestResponseSchema = z.object({
  id: z.uuid(),
  exerciseId: z.uuid(),
  score: z.number().int().min(0).max(100),
  rubric: z.object({
    accuracy: z.number().int().min(0).max(40),
    grammar: z.number().int().min(0).max(30),
    fluency: z.number().int().min(0).max(20),
    bonus: z.number().int().min(0).max(10),
  }),
  overallFeedback: z.string().trim().min(1),
  suggestedReview: z.array(z.string().trim().min(1)).max(10).nullable().optional(),
  responseTimeMs: z.number().int().nonnegative().nullable().optional(),
  createdAt: z.date(),
  evaluationMethod: z.enum(['deterministic', 'llm']).default('deterministic'),
});

export type StoredExercise = z.infer<typeof StoredExerciseSchema>;
export function parseStoredExercise(input: unknown): StoredExercise {
  return StoredExerciseSchema.parse(input);
}

function toExerciseLatestResponse(input: unknown) {
  const parsed = StoredLatestResponseSchema.safeParse(input);
  if (!parsed.success) {
    return null;
  }

  return ExerciseLatestResponseSchema.parse({
    id: parsed.data.id,
    exerciseId: parsed.data.exerciseId,
    score: parsed.data.score,
    rubric: parsed.data.rubric,
    overallFeedback: parsed.data.overallFeedback,
    suggestedReview: parsed.data.suggestedReview ?? [],
    responseTimeMs: parsed.data.responseTimeMs ?? null,
    createdAt: parsed.data.createdAt.toISOString(),
    evaluationMethod: parsed.data.evaluationMethod,
  });
}

export function toExerciseCard(input: {
  exercise: unknown;
  latestResponse?: unknown;
}) {
  const exercise = parseStoredExercise(input.exercise);
  const latestResponse = input.latestResponse
    ? toExerciseLatestResponse(input.latestResponse)
    : null;

  switch (exercise.type) {
    case 'multiple_choice':
      return ExerciseCardSchema.parse({
        id: exercise.id,
        type: exercise.type,
        difficulty: exercise.difficulty,
        question: exercise.question,
        grammarFocus: exercise.grammarFocus,
        createdAt: exercise.createdAt.toISOString(),
        timesAttempted: exercise.timesAttempted ?? 0,
        averageScore: exercise.averageScore ?? null,
        latestResponse,
        renderData: {
          options: exercise.exerciseData.options,
        },
      });
    case 'fill_gap':
      return ExerciseCardSchema.parse({
        id: exercise.id,
        type: exercise.type,
        difficulty: exercise.difficulty,
        question: exercise.question,
        grammarFocus: exercise.grammarFocus,
        createdAt: exercise.createdAt.toISOString(),
        timesAttempted: exercise.timesAttempted ?? 0,
        averageScore: exercise.averageScore ?? null,
        latestResponse,
        renderData: {
          hint: exercise.exerciseData.hint ?? null,
        },
      });
    case 'single_answer':
      return ExerciseCardSchema.parse({
        id: exercise.id,
        type: exercise.type,
        difficulty: exercise.difficulty,
        question: exercise.question,
        grammarFocus: exercise.grammarFocus,
        createdAt: exercise.createdAt.toISOString(),
        timesAttempted: exercise.timesAttempted ?? 0,
        averageScore: exercise.averageScore ?? null,
        latestResponse,
        renderData: {
          gradingCriteria: exercise.exerciseData.gradingCriteria,
        },
      });
  }
}
