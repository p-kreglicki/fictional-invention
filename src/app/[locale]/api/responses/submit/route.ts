import type { ArcjetDecision, ArcjetRateLimitReason } from '@arcjet/next';

import { fixedWindow } from '@arcjet/next';
import { NextResponse } from 'next/server';
import {
  AnswerEvaluationError,
  evaluateExerciseAnswer,
  ExerciseNotFoundError,
} from '@/libs/AnswerEvaluation';
import arcjet from '@/libs/Arcjet';
import { getMissingArcjetConfigResponse } from '@/libs/ArcjetConfig';
import { AuthenticationError, requireUser, UserNotFoundError } from '@/libs/Auth';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import {
  findDuplicateSubmission,
  recordExerciseResponse,
} from '@/libs/ResponseSubmission';
import { SubmitResponseRequestSchema } from '@/validations/ResponseValidation';

export const runtime = 'nodejs';

const RESPONSE_RATE_LIMIT_MAX_REQUESTS = Env.RESPONSE_RATE_LIMIT_MAX_REQUESTS ?? 30;
const RESPONSE_RATE_LIMIT_WINDOW_SECONDS = Env.RESPONSE_RATE_LIMIT_WINDOW_SECONDS ?? 60;

const responseRateLimiter = arcjet.withRule(
  fixedWindow({
    mode: 'LIVE',
    max: RESPONSE_RATE_LIMIT_MAX_REQUESTS,
    window: `${RESPONSE_RATE_LIMIT_WINDOW_SECONDS}s`,
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

function isUniqueConstraintError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    let rateLimitReason: ArcjetRateLimitReason | null = null;

    if (Env.ARCJET_KEY) {
      const decision = await responseRateLimiter.protect(request, { userId: user.id });
      rateLimitReason = getRateLimitReason(decision);

      if (decision.isDenied()) {
        if (rateLimitReason) {
          const response = NextResponse.json(
            { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many submission requests' },
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
      const missingArcjetConfigResponse = getMissingArcjetConfigResponse({ area: 'Response' });
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

    const parsedRequest = SubmitResponseRequestSchema.safeParse(parsedBody.body);
    if (!parsedRequest.success) {
      const response = NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Invalid submission payload' },
        { status: 422 },
      );

      if (rateLimitReason) {
        setRateLimitHeaders(response, rateLimitReason);
      }

      return response;
    }

    const duplicateSubmission = await findDuplicateSubmission({
      userId: user.id,
      clientSubmissionId: parsedRequest.data.clientSubmissionId,
    });

    if (duplicateSubmission) {
      const response = NextResponse.json(duplicateSubmission, { status: 200 });

      if (rateLimitReason) {
        setRateLimitHeaders(response, rateLimitReason);
      }

      return response;
    }

    const evaluation = await evaluateExerciseAnswer({
      userId: user.id,
      exerciseId: parsedRequest.data.exerciseId,
      answer: parsedRequest.data.answer,
    });

    try {
      const payload = await recordExerciseResponse({
        userId: user.id,
        exerciseId: parsedRequest.data.exerciseId,
        clientSubmissionId: parsedRequest.data.clientSubmissionId,
        answer: parsedRequest.data.answer,
        responseTimeMs: parsedRequest.data.responseTimeMs,
        evaluation: evaluation.evaluation,
      });

      const response = NextResponse.json(payload, { status: 200 });
      if (rateLimitReason) {
        setRateLimitHeaders(response, rateLimitReason);
      }

      return response;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const duplicateSubmission = await findDuplicateSubmission({
          userId: user.id,
          clientSubmissionId: parsedRequest.data.clientSubmissionId,
        });

        if (duplicateSubmission) {
          const response = NextResponse.json(duplicateSubmission, { status: 200 });

          if (rateLimitReason) {
            setRateLimitHeaders(response, rateLimitReason);
          }

          return response;
        }

        const response = NextResponse.json(
          { error: 'DUPLICATE_SUBMISSION', message: 'Submission already processed' },
          { status: 409 },
        );

        if (rateLimitReason) {
          setRateLimitHeaders(response, rateLimitReason);
        }

        return response;
      }

      throw error;
    }
  } catch (error) {
    logger.error('Failed to submit response', { error });

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

    if (error instanceof ExerciseNotFoundError) {
      return NextResponse.json(
        { error: 'EXERCISE_NOT_FOUND', message: 'Exercise not found' },
        { status: 404 },
      );
    }

    if (error instanceof AnswerEvaluationError) {
      return NextResponse.json(
        { error: 'EVALUATION_FAILED', message: error.message },
        { status: 422 },
      );
    }

    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}
