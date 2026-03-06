import type { EvaluationResult } from '@/validations/ResponseValidation';
import { and, eq, sql } from 'drizzle-orm';
import { ExerciseNotFoundError } from '@/libs/AnswerEvaluation';
import { db } from '@/libs/DB';
import { exercisesSchema, responsesSchema } from '@/models/Schema';
import {
  SubmitResponseSuccessSchema,
} from '@/validations/ResponseValidation';

export async function findDuplicateSubmission(input: {
  userId: string;
  clientSubmissionId: string;
}) {
  const [response] = await db
    .select({
      id: responsesSchema.id,
      exerciseId: responsesSchema.exerciseId,
      score: responsesSchema.score,
      evaluationMethod: responsesSchema.evaluationMethod,
      rubric: responsesSchema.rubric,
      overallFeedback: responsesSchema.overallFeedback,
      suggestedReview: responsesSchema.suggestedReview,
      responseTimeMs: responsesSchema.responseTimeMs,
      createdAt: responsesSchema.createdAt,
      timesAttempted: exercisesSchema.timesAttempted,
      averageScore: exercisesSchema.averageScore,
    })
    .from(responsesSchema)
    .innerJoin(exercisesSchema, eq(exercisesSchema.id, responsesSchema.exerciseId))
    .where(and(
      eq(responsesSchema.userId, input.userId),
      eq(responsesSchema.clientSubmissionId, input.clientSubmissionId),
      eq(exercisesSchema.userId, input.userId),
    ));

  if (!response) {
    return null;
  }

  return SubmitResponseSuccessSchema.parse({
    response: {
      id: response.id,
      exerciseId: response.exerciseId,
      score: response.score,
      rubric: response.rubric,
      overallFeedback: response.overallFeedback,
      suggestedReview: response.suggestedReview ?? [],
      responseTimeMs: response.responseTimeMs ?? null,
      createdAt: response.createdAt.toISOString(),
      evaluationMethod: response.evaluationMethod ?? 'deterministic',
    },
    exerciseStats: {
      timesAttempted: response.timesAttempted ?? 0,
      averageScore: response.averageScore ?? null,
    },
  });
}

export async function recordExerciseResponse(input: {
  userId: string;
  exerciseId: string;
  clientSubmissionId: string;
  answer: string | number;
  responseTimeMs?: number;
  evaluation: EvaluationResult;
}) {
  return db.transaction(async (tx) => {
    const lockResult = await tx.execute(
      sql`SELECT ${exercisesSchema.id} FROM ${exercisesSchema} WHERE ${exercisesSchema.id} = ${input.exerciseId} AND ${exercisesSchema.userId} = ${input.userId} FOR UPDATE`,
    );

    const lockedExerciseRow = lockResult.rows[0] as { id?: unknown } | undefined;
    if (typeof lockedExerciseRow?.id !== 'string') {
      throw new ExerciseNotFoundError();
    }

    const [response] = await tx
      .insert(responsesSchema)
      .values({
        userId: input.userId,
        exerciseId: input.exerciseId,
        clientSubmissionId: input.clientSubmissionId,
        answer: String(input.answer),
        score: input.evaluation.score,
        evaluationMethod: input.evaluation.evaluationMethod,
        rubric: input.evaluation.rubric,
        overallFeedback: input.evaluation.overallFeedback,
        suggestedReview: input.evaluation.suggestedReview,
        responseTimeMs: input.responseTimeMs,
      })
      .returning({
        id: responsesSchema.id,
        exerciseId: responsesSchema.exerciseId,
        score: responsesSchema.score,
        evaluationMethod: responsesSchema.evaluationMethod,
        rubric: responsesSchema.rubric,
        overallFeedback: responsesSchema.overallFeedback,
        suggestedReview: responsesSchema.suggestedReview,
        responseTimeMs: responsesSchema.responseTimeMs,
        createdAt: responsesSchema.createdAt,
      });

    const [aggregate] = await tx
      .select({
        timesAttempted: sql<number>`cast(count(*) as integer)`,
        averageScore: sql<number | null>`cast(round(avg(${responsesSchema.score})) as integer)`,
      })
      .from(responsesSchema)
      .where(eq(responsesSchema.exerciseId, input.exerciseId));

    const [exerciseStats] = await tx
      .update(exercisesSchema)
      .set({
        timesAttempted: aggregate?.timesAttempted ?? 0,
        averageScore: aggregate?.averageScore ?? null,
      })
      .where(and(
        eq(exercisesSchema.id, input.exerciseId),
        eq(exercisesSchema.userId, input.userId),
      ))
      .returning({
        timesAttempted: exercisesSchema.timesAttempted,
        averageScore: exercisesSchema.averageScore,
      });

    if (!response || !exerciseStats) {
      throw new Error('Failed to persist evaluated response');
    }

    return SubmitResponseSuccessSchema.parse({
      response: {
        id: response.id,
        exerciseId: response.exerciseId,
        score: response.score,
        rubric: response.rubric,
        overallFeedback: response.overallFeedback,
        suggestedReview: response.suggestedReview ?? [],
        responseTimeMs: response.responseTimeMs ?? null,
        createdAt: response.createdAt.toISOString(),
        evaluationMethod: response.evaluationMethod,
      },
      exerciseStats: {
        timesAttempted: exerciseStats.timesAttempted ?? 0,
        averageScore: exerciseStats.averageScore ?? null,
      },
    });
  });
}
