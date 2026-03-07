import { NextResponse } from 'next/server';
import { AuthenticationError, requireUser, UserNotFoundError } from '@/libs/Auth';
import { listActiveGenerationJobs, listLatestResponsesForExercises, listRecentExercises } from '@/libs/ExerciseGeneration';
import { safeToExerciseCard } from '@/libs/ExercisePresenter';
import { logger } from '@/libs/Logger';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await requireUser();
    const [exercises, activeJobs] = await Promise.all([
      listRecentExercises(user.id, 50),
      listActiveGenerationJobs(user.id),
    ]);
    const latestResponses = await listLatestResponsesForExercises(
      user.id,
      exercises.map(exercise => exercise.id),
    );
    const exerciseCards = exercises.flatMap((exercise) => {
      const result = safeToExerciseCard({
        exercise,
        latestResponse: latestResponses.get(exercise.id),
      });

      if (!result.success) {
        logger.warn('exercise_card_serialization_failed', {
          exerciseId: exercise.id,
          error: result.error,
        });
        return [];
      }

      return [result.data];
    });

    return NextResponse.json({
      exercises: exerciseCards,
      activeJobs: activeJobs.map(job => ({
        id: job.id,
        status: job.status,
        requestedCount: job.requestedCount,
        generatedCount: job.generatedCount,
        failedCount: job.failedCount,
        errorMessage: job.errorMessage,
        createdAt: job.createdAt.toISOString(),
        startedAt: job.startedAt?.toISOString() ?? null,
        completedAt: job.completedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    logger.error('Failed to list exercises', { error });

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
