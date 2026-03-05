import * as z from 'zod';

const difficultyValues = ['beginner', 'intermediate', 'advanced'] as const;
const evaluationMethodValues = ['deterministic', 'llm'] as const;

const DifficultySchema = z.enum(difficultyValues);
const EvaluationMethodSchema = z.enum(evaluationMethodValues);

const TextAnswerSchema = z.string().trim().min(1).max(2000);
const MultipleChoiceAnswerSchema = z.number().int().min(0).max(3);

export const SubmitResponseRequestSchema = z.object({
  exerciseId: z.uuid(),
  answer: z.union([TextAnswerSchema, MultipleChoiceAnswerSchema]),
  responseTimeMs: z.number().int().nonnegative().optional(),
  clientSubmissionId: z.uuid(),
});

const EvaluationRubricSchema = z.object({
  accuracy: z.number().int().min(0).max(40),
  grammar: z.number().int().min(0).max(30),
  fluency: z.number().int().min(0).max(20),
  bonus: z.number().int().min(0).max(10),
});

export const EvaluationResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  rubric: EvaluationRubricSchema,
  overallFeedback: z.string().trim().min(1).max(1000),
  suggestedReview: z.array(z.string().trim().min(1).max(120)).max(10),
  corrections: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
  evaluationMethod: EvaluationMethodSchema,
});

export const ExerciseLatestResponseSchema = z.object({
  id: z.uuid(),
  exerciseId: z.uuid(),
  score: z.number().int().min(0).max(100),
  rubric: EvaluationRubricSchema,
  overallFeedback: z.string().trim().min(1),
  suggestedReview: z.array(z.string().trim().min(1).max(120)).max(10),
  responseTimeMs: z.number().int().nonnegative().nullable(),
  createdAt: z.iso.datetime(),
  evaluationMethod: EvaluationMethodSchema,
});

const BaseExerciseCardSchema = z.object({
  id: z.uuid(),
  difficulty: DifficultySchema.nullable(),
  question: z.string().trim().min(1).max(1000),
  grammarFocus: z.string().trim().min(1).nullable(),
  createdAt: z.iso.datetime(),
  timesAttempted: z.number().int().nonnegative(),
  averageScore: z.number().int().min(0).max(100).nullable(),
  latestResponse: ExerciseLatestResponseSchema.nullable(),
});

const MultipleChoiceExerciseCardSchema = BaseExerciseCardSchema.extend({
  type: z.literal('multiple_choice'),
  renderData: z.object({
    options: z.array(z.string().trim().min(1)).length(4),
  }),
});

const FillGapExerciseCardSchema = BaseExerciseCardSchema.extend({
  type: z.literal('fill_gap'),
  renderData: z.object({
    hint: z.string().trim().min(1).nullable(),
  }),
});

const SingleAnswerExerciseCardSchema = BaseExerciseCardSchema.extend({
  type: z.literal('single_answer'),
  renderData: z.object({
    gradingCriteria: z.array(z.string().trim().min(1)).min(1).max(8),
  }),
});

export const ExerciseCardSchema = z.discriminatedUnion('type', [
  MultipleChoiceExerciseCardSchema,
  FillGapExerciseCardSchema,
  SingleAnswerExerciseCardSchema,
]);

export const SubmitResponseSuccessSchema = z.object({
  response: ExerciseLatestResponseSchema,
  exerciseStats: z.object({
    timesAttempted: z.number().int().nonnegative(),
    averageScore: z.number().int().min(0).max(100).nullable(),
  }),
});

export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;
export type ExerciseLatestResponse = z.infer<typeof ExerciseLatestResponseSchema>;
export type ExerciseCard = z.infer<typeof ExerciseCardSchema>;
export type SubmitResponseSuccess = z.infer<typeof SubmitResponseSuccessSchema>;
