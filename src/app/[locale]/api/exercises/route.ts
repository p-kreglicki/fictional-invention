import { NextResponse } from 'next/server';
import { AuthenticationError, requireUser, UserNotFoundError } from '@/libs/Auth';
import { listActiveGenerationJobs, listRecentExercises } from '@/libs/ExerciseGeneration';
import { logger } from '@/libs/Logger';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await requireUser();
    const [exercises, activeJobs] = await Promise.all([
      listRecentExercises(user.id, 50),
      listActiveGenerationJobs(user.id),
    ]);

    return NextResponse.json({
      exercises: exercises.map(exercise => ({
        id: exercise.id,
        type: exercise.type,
        difficulty: exercise.difficulty,
        question: exercise.question,
        exerciseData: exercise.exerciseData,
        sourceChunkIds: exercise.sourceChunkIds,
        grammarFocus: exercise.grammarFocus,
        createdAt: exercise.createdAt.toISOString(),
      })),
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
