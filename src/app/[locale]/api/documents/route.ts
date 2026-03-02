import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { requireUser } from '@/libs/Auth';
import { db } from '@/libs/DB';
import { logger } from '@/libs/Logger';
import { documentsSchema } from '@/models/Schema';

/**
 * GET /api/documents
 * Lists all documents for the authenticated user.
 */
export async function GET() {
  try {
    const user = await requireUser();

    const documents = await db
      .select({
        id: documentsSchema.id,
        title: documentsSchema.title,
        contentType: documentsSchema.contentType,
        status: documentsSchema.status,
        chunkCount: documentsSchema.chunkCount,
        errorMessage: documentsSchema.errorMessage,
        sourceUrl: documentsSchema.sourceUrl,
        originalFilename: documentsSchema.originalFilename,
        createdAt: documentsSchema.createdAt,
        processedAt: documentsSchema.processedAt,
      })
      .from(documentsSchema)
      .where(eq(documentsSchema.userId, user.id))
      .orderBy(desc(documentsSchema.createdAt));

    return NextResponse.json({
      documents: documents.map(doc => ({
        id: doc.id,
        title: doc.title,
        contentType: doc.contentType,
        status: doc.status,
        searchable: doc.status === 'ready',
        chunkCount: doc.chunkCount,
        errorMessage: doc.errorMessage,
        sourceUrl: doc.sourceUrl,
        originalFilename: doc.originalFilename,
        createdAt: doc.createdAt.toISOString(),
        processedAt: doc.processedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    logger.error('Failed to list documents', { error });

    if (error instanceof Error && error.message.includes('Authentication')) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 },
      );
    }

    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}
