import * as z from 'zod';

const exerciseTypeValues = ['multiple_choice', 'fill_gap', 'single_answer'] as const;
const difficultyValues = ['beginner', 'intermediate', 'advanced'] as const;

const ExerciseTypeSchema = z.enum(exerciseTypeValues);
const DifficultySchema = z.enum(difficultyValues);

export const GenerateExercisesRequestSchema = z.object({
  documentIds: z.array(z.uuid()).min(1).max(10),
  exerciseType: ExerciseTypeSchema,
  count: z.number().int().min(1).max(20),
  difficulty: DifficultySchema.optional(),
  topicFocus: z.string().min(1).max(120).optional(),
}).superRefine((value, context) => {
  if (new Set(value.documentIds).size !== value.documentIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'documentIds must contain unique values',
      path: ['documentIds'],
    });
  }
});

const BaseGeneratedExerciseSchema = z.object({
  type: ExerciseTypeSchema,
  question: z.string().min(1).max(1000),
  sourceChunkPositions: z.array(z.number().int().min(0)).min(1).max(3),
});

const GeneratedMultipleChoiceExerciseSchema = BaseGeneratedExerciseSchema.extend({
  type: z.literal('multiple_choice'),
  exerciseData: z.object({
    options: z.array(z.string().min(1)).length(4),
    correctIndex: z.number().int().min(0).max(3),
    explanation: z.string().min(1).optional(),
  }),
});

const GeneratedFillGapExerciseSchema = BaseGeneratedExerciseSchema.extend({
  type: z.literal('fill_gap'),
  exerciseData: z.object({
    answer: z.string().min(1),
    acceptedAnswers: z.array(z.string().min(1)).min(1).max(5).optional(),
    hint: z.string().min(1).optional(),
  }),
}).refine((value) => {
  return (value.question.match(/___/g) ?? []).length === 1;
}, {
  message: 'question must contain exactly one ___ placeholder',
  path: ['question'],
});

const GeneratedSingleAnswerExerciseSchema = BaseGeneratedExerciseSchema.extend({
  type: z.literal('single_answer'),
  exerciseData: z.object({
    sampleAnswer: z.string().min(1),
    gradingCriteria: z.array(z.string().min(1)).min(1).max(8),
  }),
});

export const GeneratedExerciseSchema = z.discriminatedUnion('type', [
  GeneratedMultipleChoiceExerciseSchema,
  GeneratedFillGapExerciseSchema,
  GeneratedSingleAnswerExerciseSchema,
]);

export const GeneratedExercisesResponseSchema = z.object({
  exercises: z.array(GeneratedExerciseSchema).min(1).max(20),
});

export type GenerateExercisesRequest = z.infer<typeof GenerateExercisesRequestSchema>;
export type GeneratedExercise = z.infer<typeof GeneratedExerciseSchema>;
