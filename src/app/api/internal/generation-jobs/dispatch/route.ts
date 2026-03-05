import { NextResponse } from 'next/server';
import { Env } from '@/libs/Env';
import { countPendingGenerationJobs, runGenerationWorkerBatch } from '@/libs/ExerciseGeneration';
import { logger } from '@/libs/Logger';

export const runtime = 'nodejs';

const DEFAULT_MAX_JOBS = 10;
const MAX_ALLOWED_JOBS = 100;

type DispatchRequestBody = {
  maxJobs?: number;
};

function extractBearerToken(request: Request) {
  const value = request.headers.get('authorization');
  if (!value || !value.startsWith('Bearer ')) {
    return null;
  }

  return value.slice('Bearer '.length).trim();
}

function normalizeMaxJobs(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return null;
  }

  if (value < 1 || value > MAX_ALLOWED_JOBS) {
    return null;
  }

  return value;
}

export async function POST(request: Request) {
  const dispatchToken = Env.GENERATION_DISPATCH_TOKEN;
  const providedToken = extractBearerToken(request);

  if (!dispatchToken || !providedToken || providedToken !== dispatchToken) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Authentication required' },
      { status: 401 },
    );
  }

  let maxJobs = DEFAULT_MAX_JOBS;

  const rawBody = await request.text();
  if (rawBody.trim().length > 0) {
    try {
      const parsedBody = JSON.parse(rawBody) as DispatchRequestBody;
      if (parsedBody.maxJobs !== undefined) {
        const parsed = normalizeMaxJobs(parsedBody.maxJobs);
        if (!parsed) {
          return NextResponse.json(
            { error: 'INVALID_REQUEST', message: `maxJobs must be an integer between 1 and ${MAX_ALLOWED_JOBS}` },
            { status: 422 },
          );
        }

        maxJobs = parsed;
      }
    } catch {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Invalid JSON payload' },
        { status: 422 },
      );
    }
  }

  try {
    const batch = await runGenerationWorkerBatch({ maxJobs });
    const remainingPendingEstimate = await countPendingGenerationJobs();

    logger.info('generation_worker_dispatch_invoked', {
      maxJobs,
      claimed: batch.claimed,
      completed: batch.completed,
      failed: batch.failed,
      remainingPendingEstimate,
    });

    return NextResponse.json({
      claimed: batch.claimed,
      completed: batch.completed,
      failed: batch.failed,
      remainingPendingEstimate,
    });
  } catch (error) {
    logger.error('generation_worker_dispatch_failed', {
      error,
      maxJobs,
    });

    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}
