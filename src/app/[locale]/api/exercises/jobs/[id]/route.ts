import { NextResponse } from 'next/server';
import { AuthenticationError, requireUser, UserNotFoundError } from '@/libs/Auth';
import { getGenerationJobWithExercises } from '@/libs/ExerciseGeneration';
import { logger } from '@/libs/Logger';

export const runtime = 'nodejs';

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, props: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await props.params;
    const result = await getGenerationJobWithExercises(id, user.id);

    if (!result) {
      return NextResponse.json(
        { error: 'JOB_NOT_FOUND', message: 'Generation job not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      id: result.job.id,
      status: result.job.status,
      requestedCount: result.job.requestedCount,
      generatedCount: result.job.generatedCount,
      failedCount: result.job.failedCount,
      errorMessage: result.job.errorMessage,
      createdAt: result.job.createdAt.toISOString(),
      startedAt: result.job.startedAt?.toISOString() ?? null,
      completedAt: result.job.completedAt?.toISOString() ?? null,
      exercises: result.exercises.map(exercise => ({
        id: exercise.id,
        type: exercise.type,
        difficulty: exercise.difficulty,
        question: exercise.question,
        exerciseData: exercise.exerciseData,
        sourceChunkIds: exercise.sourceChunkIds,
        grammarFocus: exercise.grammarFocus,
        createdAt: exercise.createdAt.toISOString(),
      })),
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
