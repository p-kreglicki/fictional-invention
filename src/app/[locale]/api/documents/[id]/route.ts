import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { AuthenticationError, requireUser, UserNotFoundError } from '@/libs/Auth';
import { deleteDocument } from '@/libs/ContentIngestion';
import { db } from '@/libs/DB';
import { logger } from '@/libs/Logger';
import { documentsSchema } from '@/models/Schema';

type RouteParams = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/documents/[id]
 * Retrieves a document's status and metadata.
 * @param _request - The incoming HTTP request (unused)
 * @param props - Route params containing document ID
 */
export async function GET(_request: Request, props: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await props.params;

    // Fetch document scoped to authenticated user to avoid existence leaks
    const document = await db.query.documentsSchema.findFirst({
      where: and(
        eq(documentsSchema.id, id),
        eq(documentsSchema.userId, user.id),
      ),
    });

    if (!document) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Document not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      id: document.id,
      title: document.title,
      contentType: document.contentType,
      status: document.status,
      searchable: document.status === 'ready',
      chunkCount: document.chunkCount,
      errorMessage: document.errorMessage,
      sourceUrl: document.sourceUrl,
      originalFilename: document.originalFilename,
      createdAt: document.createdAt.toISOString(),
      processedAt: document.processedAt?.toISOString() ?? null,
    });
  } catch (error) {
    logger.error('Failed to get document', { error });

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

/**
 * DELETE /api/documents/[id]
 * Deletes a document and its associated chunks and vectors.
 * @param _request - The incoming HTTP request (unused)
 * @param props - Route params containing document ID
 */
export async function DELETE(_request: Request, props: RouteParams) {
  try {
    const user = await requireUser();
    const { id } = await props.params;

    const deleted = await deleteDocument(id, user.id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Document not found or access denied' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error('Failed to delete document', { error });

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
