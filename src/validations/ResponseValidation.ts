import * as z from 'zod';
import { EvaluationRubricSchema } from '@/validations/EvaluationSchemas';
import { validateUniqueStrings } from '@/validations/UniqueStringValidation';

const difficultyValues = ['beginner', 'intermediate', 'advanced'] as const;
const evaluationMethodValues = ['deterministic', 'llm'] as const;

const DifficultySchema = z.enum(difficultyValues);
const EvaluationMethodSchema = z.enum(evaluationMethodValues);
const ExerciseSetStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);

const TextAnswerSchema = z.string().trim().min(1).max(2000);
const MultipleChoiceAnswerSchema = z.number().int().min(0).max(3);

const SubmissionDraftSchema = z.object({
  answerKey: z.string().min(1).max(2100),
  clientSubmissionId: z.uuid(),
});

export const SubmissionDraftsSchema = z.record(
  z.string().min(1),
  SubmissionDraftSchema,
);

export const SubmitResponseRequestSchema = z.object({
  exerciseId: z.uuid(),
  answer: z.union([TextAnswerSchema, MultipleChoiceAnswerSchema]),
  responseTimeMs: z.number().int().nonnegative().optional(),
  clientSubmissionId: z.uuid(),
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
}).superRefine((value, context) => {
  validateUniqueStrings(value.renderData.options, context, 'renderData.options');
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

export const ExerciseSetSchema = z.object({
  id: z.uuid(),
  status: ExerciseSetStatusSchema,
  requestedCount: z.number().int().nonnegative(),
  generatedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  errorMessage: z.string().trim().min(1).nullable(),
  exerciseType: z.enum(['multiple_choice', 'fill_gap', 'single_answer']),
  difficulty: DifficultySchema.nullable(),
  topicFocus: z.string().trim().min(1).max(120).nullable(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  sourceDocuments: z.array(z.object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(200),
  })).max(10),
  exercises: z.array(ExerciseCardSchema).max(50),
});

export const ExerciseSetSummarySchema = ExerciseSetSchema.omit({
  sourceDocuments: true,
  exercises: true,
});

export const ExercisesDashboardResponseSchema = z.object({
  sets: z.array(ExerciseSetSchema).max(20),
  activeJobs: z.array(ExerciseSetSummarySchema).max(20),
});

export const SubmitResponseSuccessSchema = z.object({
  response: ExerciseLatestResponseSchema,
  exerciseStats: z.object({
    timesAttempted: z.number().int().nonnegative(),
    averageScore: z.number().int().min(0).max(100).nullable(),
  }),
});

export const ResponseHistoryQuerySchema = z.object({
  documentId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
});

export const ProgressSourceDocumentSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200),
});

export const ProgressHistoryItemSchema = z.object({
  id: z.uuid(),
  exerciseId: z.uuid(),
  exerciseType: z.enum(['multiple_choice', 'fill_gap', 'single_answer']),
  score: z.number().int().min(0).max(100),
  overallFeedback: z.string().trim().min(1).max(1000),
  createdAt: z.iso.datetime(),
  documents: z.array(ProgressSourceDocumentSchema).max(20),
});

export const ScoreTrendPointSchema = z.object({
  createdAt: z.iso.datetime(),
  score: z.number().int().min(0).max(100),
});

export const ResponsesHistoryResponseSchema = z.object({
  items: z.array(ProgressHistoryItemSchema).max(100),
  availableDocuments: z.array(ProgressSourceDocumentSchema).max(100),
  trend: z.object({
    averageScore: z.number().int().min(0).max(100).nullable(),
    points: z.array(ScoreTrendPointSchema).max(100),
  }),
  pageInfo: z.object({
    nextCursor: z.string().min(1).nullable(),
  }),
});

export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;
export type ExerciseLatestResponse = z.infer<typeof ExerciseLatestResponseSchema>;
export type ExerciseCard = z.infer<typeof ExerciseCardSchema>;
export type ExerciseSet = z.infer<typeof ExerciseSetSchema>;
export type ExerciseSetSummary = z.infer<typeof ExerciseSetSummarySchema>;
export type ExercisesDashboardResponse = z.infer<typeof ExercisesDashboardResponseSchema>;
export type SubmitResponseSuccess = z.infer<typeof SubmitResponseSuccessSchema>;
export type ProgressSourceDocument = z.infer<typeof ProgressSourceDocumentSchema>;
export type ProgressHistoryItem = z.infer<typeof ProgressHistoryItemSchema>;
export type ScoreTrendPoint = z.infer<typeof ScoreTrendPointSchema>;
