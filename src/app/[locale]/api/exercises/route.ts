import { NextResponse } from 'next/server';
import { AuthenticationError, requireUser, UserNotFoundError } from '@/libs/Auth';
import { listActiveGenerationJobs, listRecentGenerationSets } from '@/libs/ExerciseGeneration';
import { safeToExerciseCard } from '@/libs/ExercisePresenter';
import { logger } from '@/libs/Logger';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await requireUser();
    const [sets, activeJobs] = await Promise.all([
      listRecentGenerationSets(user.id, 10),
      listActiveGenerationJobs(user.id),
    ]);
    const exerciseSets = sets.map((set) => {
      const exercises = set.exercises.flatMap((exercise) => {
        const result = safeToExerciseCard({
          exercise,
          latestResponse: set.latestResponsesByExerciseId.get(exercise.id),
        });

        if (!result.success) {
          logger.warn('exercise_card_serialization_failed', {
            exerciseId: exercise.id,
            error: result.error,
            jobId: set.job.id,
          });
          return [];
        }

        return [result.data];
      });

      return {
        id: set.job.id,
        status: set.job.status,
        requestedCount: set.job.requestedCount,
        generatedCount: set.job.generatedCount,
        failedCount: set.job.failedCount,
        errorMessage: set.job.errorMessage,
        exerciseType: set.job.exerciseType,
        difficulty: set.job.difficulty,
        topicFocus: set.job.topicFocus,
        createdAt: set.job.createdAt.toISOString(),
        startedAt: set.job.startedAt?.toISOString() ?? null,
        completedAt: set.job.completedAt?.toISOString() ?? null,
        sourceDocuments: set.sourceDocuments,
        exercises,
      };
    });
    const exerciseSetIds = new Set(exerciseSets.map(set => set.id));

    return NextResponse.json({
      sets: exerciseSets,
      activeJobs: activeJobs
        .filter(job => !exerciseSetIds.has(job.id))
        .map(job => ({
          id: job.id,
          status: job.status,
          requestedCount: job.requestedCount,
          generatedCount: job.generatedCount,
          failedCount: job.failedCount,
          errorMessage: job.errorMessage,
          exerciseType: job.exerciseType,
          difficulty: job.difficulty,
          topicFocus: job.topicFocus,
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
