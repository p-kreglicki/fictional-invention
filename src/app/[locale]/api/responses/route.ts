import type { ArcjetDecision, ArcjetRateLimitReason } from '@arcjet/next';

import { Buffer } from 'node:buffer';
import { fixedWindow } from '@arcjet/next';
import { and, desc, eq, gte, inArray, or, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import arcjet from '@/libs/Arcjet';
import { getMissingArcjetConfigResponse } from '@/libs/ArcjetConfig';
import { AuthenticationError, requireUser, UserNotFoundError } from '@/libs/Auth';
import { db } from '@/libs/DB';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import {
  documentsSchema,
  exercisesSchema,
  responsesSchema,
} from '@/models/Schema';
import {
  ResponseHistoryQuerySchema,
  ResponsesHistoryResponseSchema,
} from '@/validations/ResponseValidation';

export const runtime = 'nodejs';

const RESPONSE_HISTORY_RATE_LIMIT_MAX_REQUESTS = Env.RESPONSE_RATE_LIMIT_MAX_REQUESTS ?? 30;
const RESPONSE_HISTORY_RATE_LIMIT_WINDOW_SECONDS = Env.RESPONSE_RATE_LIMIT_WINDOW_SECONDS ?? 60;
const RESPONSE_HISTORY_TREND_LIMIT = 100;
const RESPONSE_HISTORY_TREND_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const responseHistoryRateLimiter = arcjet.withRule(
  fixedWindow({
    mode: 'LIVE',
    max: RESPONSE_HISTORY_RATE_LIMIT_MAX_REQUESTS,
    window: `${RESPONSE_HISTORY_RATE_LIMIT_WINDOW_SECONDS}s`,
    characteristics: ['userId'],
  }),
);

type HistoryCursor = {
  createdAt: string;
  id: string;
};

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

function encodeCursor(input: HistoryCursor) {
  return Buffer.from(JSON.stringify(input)).toString('base64url');
}

function decodeCursor(cursor: string): HistoryCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as HistoryCursor;

    if (
      typeof parsed.createdAt !== 'string'
      || Number.isNaN(new Date(parsed.createdAt).getTime())
      || typeof parsed.id !== 'string'
      || parsed.id.length === 0
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function buildDocumentFilter(documentId?: string) {
  if (!documentId) {
    return undefined;
  }

  return sql<boolean>`${exercisesSchema.sourceDocumentIds} @> ARRAY[${documentId}]::uuid[]`;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    let rateLimitReason: ArcjetRateLimitReason | null = null;

    if (Env.ARCJET_KEY) {
      const decision = await responseHistoryRateLimiter.protect(request, { userId: user.id });
      rateLimitReason = getRateLimitReason(decision);

      if (decision.isDenied()) {
        if (rateLimitReason) {
          const response = NextResponse.json(
            { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many history requests' },
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
      const missingArcjetConfigResponse = getMissingArcjetConfigResponse({ area: 'Response history' });
      if (missingArcjetConfigResponse) {
        return missingArcjetConfigResponse;
      }
    }

    const url = new URL(request.url);
    const parsedQuery = ResponseHistoryQuerySchema.safeParse({
      documentId: url.searchParams.get('documentId') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
    });

    if (!parsedQuery.success) {
      const response = NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Invalid response history query' },
        { status: 422 },
      );

      if (rateLimitReason) {
        setRateLimitHeaders(response, rateLimitReason);
      }

      return response;
    }

    const cursor = parsedQuery.data.cursor ? decodeCursor(parsedQuery.data.cursor) : null;
    if (parsedQuery.data.cursor && !cursor) {
      const response = NextResponse.json(
        { error: 'INVALID_REQUEST', message: 'Invalid response history cursor' },
        { status: 422 },
      );

      if (rateLimitReason) {
        setRateLimitHeaders(response, rateLimitReason);
      }

      return response;
    }

    const documentFilter = buildDocumentFilter(parsedQuery.data.documentId);
    const cursorFilter = cursor
      ? or(
          sql<boolean>`${responsesSchema.createdAt} < ${new Date(cursor.createdAt)}`,
          and(
            eq(responsesSchema.createdAt, new Date(cursor.createdAt)),
            sql<boolean>`${responsesSchema.id} < ${cursor.id}::uuid`,
          ),
        )
      : undefined;

    const historyWhere = and(
      eq(responsesSchema.userId, user.id),
      eq(exercisesSchema.userId, user.id),
      documentFilter,
      cursorFilter,
    );

    const trendCutoff = new Date(Date.now() - RESPONSE_HISTORY_TREND_WINDOW_MS);

    const [historyRows, trendRows, availableDocumentRows] = await Promise.all([
      db
        .select({
          id: responsesSchema.id,
          exerciseId: responsesSchema.exerciseId,
          exerciseType: exercisesSchema.type,
          score: responsesSchema.score,
          overallFeedback: responsesSchema.overallFeedback,
          createdAt: responsesSchema.createdAt,
          sourceDocumentIds: exercisesSchema.sourceDocumentIds,
        })
        .from(responsesSchema)
        .innerJoin(exercisesSchema, eq(exercisesSchema.id, responsesSchema.exerciseId))
        .where(historyWhere)
        .orderBy(desc(responsesSchema.createdAt), desc(responsesSchema.id))
        .limit(parsedQuery.data.limit + 1),
      db
        .select({
          createdAt: responsesSchema.createdAt,
          score: responsesSchema.score,
        })
        .from(responsesSchema)
        .innerJoin(exercisesSchema, eq(exercisesSchema.id, responsesSchema.exerciseId))
        .where(and(
          eq(responsesSchema.userId, user.id),
          eq(exercisesSchema.userId, user.id),
          gte(responsesSchema.createdAt, trendCutoff),
          documentFilter,
        ))
        .orderBy(desc(responsesSchema.createdAt), desc(responsesSchema.id))
        .limit(RESPONSE_HISTORY_TREND_LIMIT),
      db
        .select({
          sourceDocumentIds: exercisesSchema.sourceDocumentIds,
        })
        .from(responsesSchema)
        .innerJoin(exercisesSchema, eq(exercisesSchema.id, responsesSchema.exerciseId))
        .where(and(
          eq(responsesSchema.userId, user.id),
          eq(exercisesSchema.userId, user.id),
          gte(responsesSchema.createdAt, trendCutoff),
        ))
        .orderBy(desc(responsesSchema.createdAt), desc(responsesSchema.id))
        .limit(RESPONSE_HISTORY_TREND_LIMIT),
    ]);

    const pageRows = historyRows.slice(0, parsedQuery.data.limit);
    const nextRow = historyRows[parsedQuery.data.limit];

    const documentIds = new Set<string>();
    for (const row of pageRows) {
      for (const documentId of row.sourceDocumentIds) {
        documentIds.add(documentId);
      }
    }
    for (const row of availableDocumentRows) {
      for (const documentId of row.sourceDocumentIds) {
        documentIds.add(documentId);
      }
    }

    const documentRows = documentIds.size === 0
      ? []
      : await db
          .select({
            id: documentsSchema.id,
            title: documentsSchema.title,
          })
          .from(documentsSchema)
          .where(and(
            eq(documentsSchema.userId, user.id),
            inArray(documentsSchema.id, [...documentIds]),
          ));

    const documentMap = new Map(documentRows.map(row => [row.id, row.title]));

    const payload = ResponsesHistoryResponseSchema.parse({
      items: pageRows.map(row => ({
        id: row.id,
        exerciseId: row.exerciseId,
        exerciseType: row.exerciseType,
        score: row.score,
        overallFeedback: row.overallFeedback,
        createdAt: row.createdAt.toISOString(),
        documents: row.sourceDocumentIds
          .map(documentId => ({
            id: documentId,
            title: documentMap.get(documentId),
          }))
          .filter((document): document is { id: string; title: string } => Boolean(document.title)),
      })),
      availableDocuments: [...documentMap.entries()]
        .map(([id, title]) => ({
          id,
          title,
        }))
        .sort((a, b) => a.title.localeCompare(b.title)),
      trend: {
        averageScore: trendRows.length === 0
          ? null
          : Math.round(trendRows.reduce((sum, row) => sum + row.score, 0) / trendRows.length),
        points: [...trendRows]
          .reverse()
          .map(row => ({
            createdAt: row.createdAt.toISOString(),
            score: row.score,
          })),
      },
      pageInfo: {
        nextCursor: nextRow
          ? encodeCursor({
              createdAt: nextRow.createdAt.toISOString(),
              id: nextRow.id,
            })
          : null,
      },
    });

    const response = NextResponse.json(payload);
    if (rateLimitReason) {
      setRateLimitHeaders(response, rateLimitReason);
    }

    return response;
  } catch (error) {
    logger.error('Failed to load response history', { error });

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
