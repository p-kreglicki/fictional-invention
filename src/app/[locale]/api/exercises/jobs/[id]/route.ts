import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AuthenticationError, requireUser, UserNotFoundError } from '@/libs/Auth';
import { deleteGenerationSet, getGenerationJobWithExercises } from '@/libs/ExerciseGeneration';
import { safeToExerciseCard } from '@/libs/ExercisePresenter';
import { logger } from '@/libs/Logger';

export const runtime = 'nodejs';

type RouteParams = {
  params: Promise<{ id: string }>;
};

const JobIdSchema = z.uuid();

export async function GET(_request: Request, props: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await props.params;
    if (!JobIdSchema.safeParse(id).success) {
      return NextResponse.json(
        { error: 'JOB_NOT_FOUND', message: 'Generation job not found' },
        { status: 404 },
      );
    }

    const result = await getGenerationJobWithExercises(id, user.id);

    if (!result) {
      return NextResponse.json(
        { error: 'JOB_NOT_FOUND', message: 'Generation job not found' },
        { status: 404 },
      );
    }
    const exercises = result.exercises.flatMap((exercise) => {
      const latestResponse = result.latestResponsesByExerciseId.get(exercise.id);
      const card = safeToExerciseCard({
        exercise,
        latestResponse,
      });

      if (!card.success) {
        logger.warn('exercise_card_serialization_failed', {
          exerciseId: exercise.id,
          error: card.error,
          jobId: result.job.id,
        });
        return [];
      }

      return [card.data];
    });

    return NextResponse.json({
      id: result.job.id,
      status: result.job.status,
      requestedCount: result.job.requestedCount,
      generatedCount: result.job.generatedCount,
      failedCount: result.job.failedCount,
      errorMessage: result.job.errorMessage,
      exerciseType: result.job.exerciseType,
      difficulty: result.job.difficulty,
      topicFocus: result.job.topicFocus,
      createdAt: result.job.createdAt.toISOString(),
      startedAt: result.job.startedAt?.toISOString() ?? null,
      completedAt: result.job.completedAt?.toISOString() ?? null,
      sourceDocuments: result.sourceDocuments,
      exercises,
    });
  } catch (error) {
    logger.error('Failed to get generation job', { error });

    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 },
      );
    }

    if (error instanceof UserNotFoundError) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User account not synced. Please try again.' },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, props: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await props.params;
    if (!JobIdSchema.safeParse(id).success) {
      return NextResponse.json(
        { error: 'JOB_NOT_FOUND', message: 'Generation set not found' },
        { status: 404 },
      );
    }

    const result = await deleteGenerationSet({
      jobId: id,
      userId: user.id,
    });

    if (!result.success) {
      const status = result.errorCode === 'JOB_NOT_FOUND' ? 404 : 409;
      return NextResponse.json(
        { error: result.errorCode, message: result.error },
        { status },
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error('Failed to delete generation job set', { error });

    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 },
      );
    }

    if (error instanceof UserNotFoundError) {
      return NextResponse.json(
        { error: 'USER_NOT_FOUND', message: 'User account not synced. Please try again.' },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}
