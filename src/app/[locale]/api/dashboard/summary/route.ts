import { and, eq, inArray, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { AuthenticationError, requireUser, UserNotFoundError } from '@/libs/Auth';
import { db } from '@/libs/DB';
import { logger } from '@/libs/Logger';
import {
  documentsSchema,
  generationJobsSchema,
  responsesSchema,
} from '@/models/Schema';
import { DashboardSummarySchema } from '@/validations/DocumentValidation';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await requireUser();

    const [documentCountsRows, activeJobsCountRow, recentAverageScoreRow] = await Promise.all([
      db
        .select({
          status: documentsSchema.status,
          count: sql<number>`cast(count(*) as integer)`,
        })
        .from(documentsSchema)
        .where(eq(documentsSchema.userId, user.id))
        .groupBy(documentsSchema.status),
      db
        .select({
          count: sql<number>`cast(count(*) as integer)`,
        })
        .from(generationJobsSchema)
        .where(and(
          eq(generationJobsSchema.userId, user.id),
          inArray(generationJobsSchema.status, ['pending', 'processing']),
        )),
      db.execute(sql<{ recentAverageScore: number | null }>`
        select cast(round(avg(recent.score)) as integer) as "recentAverageScore"
        from (
          select ${responsesSchema.score} as score
          from ${responsesSchema}
          where ${responsesSchema.userId} = ${user.id}
          order by ${responsesSchema.createdAt} desc
          limit 20
        ) as recent
      `),
    ]);

    const documentCounts = {
      total: 0,
      uploading: 0,
      processing: 0,
      ready: 0,
      failed: 0,
    };

    for (const row of documentCountsRows) {
      documentCounts.total += row.count;
      documentCounts[row.status] = row.count;
    }

    const payload = DashboardSummarySchema.parse({
      documentCounts,
      activeGenerationJobsCount: activeJobsCountRow[0]?.count ?? 0,
      recentAverageScore:
        recentAverageScoreRow.rows[0]?.recentAverageScore ?? null,
    });

    return NextResponse.json(payload);
  } catch (error) {
    logger.error('Failed to load dashboard summary', { error });

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
