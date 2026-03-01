import { Buffer } from 'node:buffer';

import { count, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import * as z from 'zod';

import { requireUser } from '@/libs/Auth';
import { ingestContent } from '@/libs/ContentIngestion';
import { db } from '@/libs/DB';
import { logger } from '@/libs/Logger';
import { processPdf } from '@/libs/PdfExtractor';
import { sanitizeText } from '@/libs/Sanitizer';
import { extractUrlContent } from '@/libs/UrlExtractor';
import { documentsSchema } from '@/models/Schema';
import { DocumentUploadSchema } from '@/validations/DocumentValidation';

// Document quota per user
const MAX_DOCUMENTS_PER_USER = 50;
const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * POST /api/documents/upload
 * Upload a document via FormData (PDF) or JSON (URL/text).
 * @param request - The incoming HTTP request
 */
export async function POST(request: Request) {
  try {
    // Authenticate user
    const user = await requireUser();

    // Check document quota
    const [quotaResult] = await db
      .select({ count: count() })
      .from(documentsSchema)
      .where(eq(documentsSchema.userId, user.id));

    const currentCount = quotaResult?.count ?? 0;
    if (currentCount >= MAX_DOCUMENTS_PER_USER) {
      return NextResponse.json(
        {
          error: 'QUOTA_EXCEEDED',
          message: `You've reached the ${MAX_DOCUMENTS_PER_USER} document limit. Delete some documents to upload more.`,
        },
        { status: 429 },
      );
    }

    // Determine content type
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // PDF upload via FormData
      return handlePdfUpload(request, user.id);
    } else if (contentType.includes('application/json')) {
      // URL or text upload via JSON
      return handleJsonUpload(request, user.id);
    } else {
      return NextResponse.json(
        { error: 'INVALID_CONTENT_TYPE', message: 'Use multipart/form-data for PDF or application/json for URL/text' },
        { status: 415 },
      );
    }
  } catch (error) {
    logger.error('Upload failed', { error });

    if (error instanceof Error && error.message.includes('Authentication')) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: 'Authentication required' },
        { status: 401 },
      );
    }

    if (error instanceof Error && error.message.includes('User not found')) {
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
 * Handles PDF upload via FormData.
 * @param request - The incoming HTTP request with FormData
 * @param userId - The authenticated user's ID
 */
async function handlePdfUpload(request: Request, userId: string) {
  const formData = await request.formData();
  const file = formData.get('file');
  const title = formData.get('title');

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: 'MISSING_FILE', message: 'No PDF file provided' },
      { status: 400 },
    );
  }

  // Validate file size
  if (file.size > MAX_PDF_SIZE) {
    return NextResponse.json(
      { error: 'PDF_TOO_LARGE', message: 'PDF exceeds 10MB limit' },
      { status: 413 },
    );
  }

  // Read file buffer
  const buffer = Buffer.from(await file.arrayBuffer());

  // Process PDF
  const extraction = await processPdf(buffer);

  if (!extraction.success) {
    return NextResponse.json(
      { error: extraction.errorCode, message: extraction.error },
      { status: 422 },
    );
  }

  // Determine title
  const documentTitle = typeof title === 'string' && title.length > 0
    ? title.slice(0, 200)
    : file.name.replace(/\.pdf$/i, '').slice(0, 200) || 'Untitled PDF';

  // Ingest content
  const result = await ingestContent({
    userId,
    title: documentTitle,
    contentType: 'pdf',
    text: extraction.text!,
    originalFilename: file.name,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.errorCode, message: result.error },
      { status: 422 },
    );
  }

  return NextResponse.json({
    documentId: result.documentId,
    chunkCount: result.chunkCount,
    status: 'ready',
  }, { status: 201 });
}

/**
 * Handles URL or text upload via JSON.
 * @param request - The incoming HTTP request with JSON body
 * @param userId - The authenticated user's ID
 */
async function handleJsonUpload(request: Request, userId: string) {
  const json = await request.json();
  const parse = DocumentUploadSchema.safeParse(json);

  if (!parse.success) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', details: z.treeifyError(parse.error) },
      { status: 422 },
    );
  }

  const data = parse.data;

  if (data.type === 'url') {
    return handleUrlUpload(data, userId);
  } else {
    return handleTextUpload(data, userId);
  }
}

/**
 * Handles URL import.
 * @param data - Validated URL upload data
 * @param userId - The authenticated user's ID
 */
async function handleUrlUpload(
  data: z.infer<typeof DocumentUploadSchema> & { type: 'url' },
  userId: string,
) {
  const extraction = await extractUrlContent(data.url);

  if (!extraction.success) {
    return NextResponse.json(
      { error: extraction.errorCode, message: extraction.error },
      { status: 422 },
    );
  }

  // Determine title (user-provided > extracted > URL hostname)
  const documentTitle = data.title
    || extraction.title
    || new URL(data.url).hostname;

  const result = await ingestContent({
    userId,
    title: documentTitle.slice(0, 200),
    contentType: 'url',
    text: extraction.text!,
    sourceUrl: data.url,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.errorCode, message: result.error },
      { status: 422 },
    );
  }

  return NextResponse.json({
    documentId: result.documentId,
    chunkCount: result.chunkCount,
    status: 'ready',
  }, { status: 201 });
}

/**
 * Handles text paste upload.
 * @param data - Validated text upload data
 * @param userId - The authenticated user's ID
 */
async function handleTextUpload(
  data: z.infer<typeof DocumentUploadSchema> & { type: 'text' },
  userId: string,
) {
  // Sanitize text
  const sanitized = sanitizeText(data.content);

  if (sanitized.length < 100) {
    return NextResponse.json(
      { error: 'TEXT_TOO_SHORT', message: 'Please provide at least 100 characters of text' },
      { status: 422 },
    );
  }

  const result = await ingestContent({
    userId,
    title: data.title.slice(0, 200),
    contentType: 'text',
    text: sanitized,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.errorCode, message: result.error },
      { status: 422 },
    );
  }

  return NextResponse.json({
    documentId: result.documentId,
    chunkCount: result.chunkCount,
    status: 'ready',
  }, { status: 201 });
}
