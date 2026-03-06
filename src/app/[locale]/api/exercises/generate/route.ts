import type { ArcjetDecision, ArcjetRateLimitReason } from '@arcjet/next';

import { fixedWindow } from '@arcjet/next';
import { NextResponse } from 'next/server';
import arcjet from '@/libs/Arcjet';
import { getMissingArcjetConfigResponse } from '@/libs/ArcjetConfig';
import { AuthenticationError, requireUser, UserNotFoundError } from '@/libs/Auth';
import { Env } from '@/libs/Env';
import { enqueueExerciseGeneration, kickGenerationWorker } from '@/libs/ExerciseGeneration';
import { logger } from '@/libs/Logger';

export const runtime = 'nodejs';

const EXERCISE_RATE_LIMIT_MAX_REQUESTS = Env.EXERCISE_RATE_LIMIT_MAX_REQUESTS ?? 20;
const EXERCISE_RATE_LIMIT_WINDOW_SECONDS = Env.EXERCISE_RATE_LIMIT_WINDOW_SECONDS ?? 60;

const exerciseRateLimiter = arcjet.withRule(
  fixedWindow({
    mode: 'LIVE',
    max: EXERCISE_RATE_LIMIT_MAX_REQUESTS,
    window: `${EXERCISE_RATE_LIMIT_WINDOW_SECONDS}s`,
    characteristics: ['userId'],
  }),
);

function getRateLimitReason(decision: ArcjetDecision): ArcjetRateLimitReason | null {
  if (decision.reason.isRateLimit()) {
    return decision.reason;
  }

  for (const result of decision.results) {
    if (result.reason.isRateLimit()) {
      return result.reason;
    }
  }

  return null;
}

function setRateLimitHeaders(response: NextResponse, reason: ArcjetRateLimitReason) {
  response.headers.set('X-RateLimit-Limit', String(reason.max));
  response.headers.set('X-RateLimit-Remaining', String(reason.remaining));
  response.headers.set('X-RateLimit-Reset', String(reason.reset));
}

async function parseJsonBody(request: Request) {
  try {
    return {
      success: true,
      body: await request.json(),
    } as const;
  } catch {
    return {
      success: false,
    } as const;
  }
}

function getEnqueueFailureStatus(errorCode: string) {
  if (errorCode === 'DOCUMENTS_NOT_FOUND' || errorCode === 'JOB_NOT_FOUND') {
    return 404;
  }

  if (
    errorCode === 'DOCUMENTS_NOT_READY'
    || errorCode === 'VALIDATION_FAILED'
    || errorCode === 'NO_CONTENT'
  ) {
    return 422;
  }

  return 500;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    let rateLimitReason: ArcjetRateLimitReason | null = null;

    if (Env.ARCJET_KEY) {
      const decision = await exerciseRateLimiter.protect(request, { userId: user.id });
      rateLimitReason = getRateLimitReason(decision);

      if (decision.isDenied()) {
        if (rateLimitReason) {
          const response = NextResponse.json(
            { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many generation requests' },
            { status: 429 },
          );
          response.headers.set('Retry-After', String(rateLimitReason.reset));
          setRateLimitHeaders(response, rateLimitReason);
          return response;
        }

        return NextResponse.json(
          { error: 'FORBIDDEN', message: 'Request blocked by security policy' },
          { status: 403 },
        );
      }
    } else {
      const missingArcjetConfigResponse = getMissingArcjetConfigResponse({ area: 'Exercise' });
      if (missingArcjetConfigResponse) {
        return missingArcjetConfigResponse;
      }
    }

    const parsedBody = await parseJsonBody(request);
    if (!parsedBody.success) {
      const response = NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Invalid JSON payload' },
        { status: 422 },
      );

      if (rateLimitReason) {
        setRateLimitHeaders(response, rateLimitReason);
      }

      return response;
    }

    const result = await enqueueExerciseGeneration({
      userId: user.id,
      request: parsedBody.body,
    });

    if (!result.success) {
      const status = getEnqueueFailureStatus(result.errorCode);

      const response = NextResponse.json(
        { error: result.errorCode, message: result.error },
        { status },
      );

      if (rateLimitReason) {
        setRateLimitHeaders(response, rateLimitReason);
      }

      return response;
    }

    const response = NextResponse.json(
      { jobId: result.jobId, status: 'pending' },
      { status: 202 },
    );

    if (rateLimitReason) {
      setRateLimitHeaders(response, rateLimitReason);
    }

    kickGenerationWorker(user.id);

    return response;
  } catch (error) {
    logger.error('Failed to enqueue generation', { error });

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
