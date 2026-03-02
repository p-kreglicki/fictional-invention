import type { ArcjetDecision, ArcjetRateLimitReason } from '@arcjet/next';

import { Buffer } from 'node:buffer';
import { fixedWindow } from '@arcjet/next';
import { NextResponse } from 'next/server';
import * as z from 'zod';

import arcjet from '@/libs/Arcjet';
import { AuthenticationError, requireUser, UserNotFoundError } from '@/libs/Auth';
import {
  ingestContent,
  markDocumentAsFailed,
  reserveDocumentSlot,
} from '@/libs/ContentIngestion';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import { processPdf } from '@/libs/PdfExtractor';
import { sanitizeText } from '@/libs/Sanitizer';
import { extractUrlContent } from '@/libs/UrlExtractor';
import { DocumentUploadSchema } from '@/validations/DocumentValidation';

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB
const UPLOAD_RATE_LIMIT_MAX_REQUESTS = Env.UPLOAD_RATE_LIMIT_MAX_REQUESTS ?? 10;
const UPLOAD_RATE_LIMIT_WINDOW_SECONDS = Env.UPLOAD_RATE_LIMIT_WINDOW_SECONDS ?? 60;

const uploadRateLimiter = arcjet.withRule(
  fixedWindow({
    mode: 'LIVE',
    max: UPLOAD_RATE_LIMIT_MAX_REQUESTS,
    window: `${UPLOAD_RATE_LIMIT_WINDOW_SECONDS}s`,
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

function setRateLimitHeaders(
  response: NextResponse,
  rateLimitReason: ArcjetRateLimitReason,
) {
  response.headers.set('X-RateLimit-Limit', String(rateLimitReason.max));
  response.headers.set('X-RateLimit-Remaining', String(rateLimitReason.remaining));
  response.headers.set('X-RateLimit-Reset', String(rateLimitReason.reset));
}

/**
 * POST /api/documents/upload
 * Upload a document via FormData (PDF) or JSON (URL/text).
 * @param request - The incoming HTTP request
 */
export async function POST(request: Request) {
  try {
    // Authenticate user
    const user = await requireUser();
    let rateLimitReason: ArcjetRateLimitReason | null = null;

    if (Env.ARCJET_KEY) {
      const decision = await uploadRateLimiter.protect(request, { userId: user.id });
      rateLimitReason = getRateLimitReason(decision);

      if (decision.isDenied()) {
        if (rateLimitReason) {
          const response = NextResponse.json(
            { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many upload requests' },
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
    }

    // Determine content type
    const contentType = request.headers.get('content-type') || '';
    let response: NextResponse;

    if (contentType.includes('multipart/form-data')) {
      // PDF upload via FormData
      response = await handlePdfUpload(request, user.id);
    } else if (contentType.includes('application/json')) {
      // URL or text upload via JSON
      response = await handleJsonUpload(request, user.id);
    } else {
      response = NextResponse.json(
        { error: 'INVALID_CONTENT_TYPE', message: 'Use multipart/form-data for PDF or application/json for URL/text' },
        { status: 415 },
      );
    }

    if (rateLimitReason) {
      setRateLimitHeaders(response, rateLimitReason);
    }

    return response;
  } catch (error) {
    logger.error('Upload failed', { error });

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

  // Determine title
  const documentTitle = typeof title === 'string' && title.length > 0
    ? title.slice(0, 200)
    : file.name.replace(/\.pdf$/i, '').slice(0, 200) || 'Untitled PDF';

  // Reserve document slot atomically (quota-safe)
  const reservation = await reserveDocumentSlot({
    userId,
    title: documentTitle,
    contentType: 'pdf',
    originalFilename: file.name,
  });

  if (!reservation.success || !reservation.documentId) {
    if (reservation.errorCode === 'QUOTA_EXCEEDED') {
      return NextResponse.json(
        { error: 'QUOTA_EXCEEDED', message: reservation.error },
        { status: 429 },
      );
    }

    return NextResponse.json(
      { error: reservation.errorCode ?? 'INTERNAL_ERROR', message: reservation.error ?? 'Failed to reserve document slot.' },
      { status: 422 },
    );
  }

  const documentId = reservation.documentId;

  // Read file buffer
  const buffer = Buffer.from(await file.arrayBuffer());

  // Process PDF
  const extraction = await processPdf(buffer);

  if (!extraction.success) {
    await markDocumentAsFailed(documentId, extraction.error ?? 'Failed to process PDF.');
    return NextResponse.json(
      { error: extraction.errorCode, message: extraction.error },
      { status: 422 },
    );
  }

  // Ingest content
  const result = await ingestContent({
    documentId,
    userId,
    title: documentTitle,
    contentType: 'pdf',
    text: extraction.text,
    originalFilename: file.name,
  });

  if (!result.success) {
    await markDocumentAsFailed(documentId, result.error ?? 'Content ingestion failed.');
    return NextResponse.json(
      { error: result.errorCode, message: result.error },
      { status: 422 },
    );
  }

  return NextResponse.json({
    documentId: result.documentId,
    chunkCount: result.chunkCount,
    status: result.status ?? 'ready',
    searchable: result.searchable ?? result.status === 'ready',
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
  const fallbackTitle = data.title || new URL(data.url).hostname;

  // Reserve document slot atomically (quota-safe)
  const reservation = await reserveDocumentSlot({
    userId,
    title: fallbackTitle.slice(0, 200),
    contentType: 'url',
    sourceUrl: data.url,
  });

  if (!reservation.success || !reservation.documentId) {
    if (reservation.errorCode === 'QUOTA_EXCEEDED') {
      return NextResponse.json(
        { error: 'QUOTA_EXCEEDED', message: reservation.error },
        { status: 429 },
      );
    }

    return NextResponse.json(
      { error: reservation.errorCode ?? 'INTERNAL_ERROR', message: reservation.error ?? 'Failed to reserve document slot.' },
      { status: 422 },
    );
  }

  const documentId = reservation.documentId;
  const extraction = await extractUrlContent(data.url);

  if (!extraction.success) {
    await markDocumentAsFailed(documentId, extraction.error ?? 'Failed to extract URL content.');
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
    documentId,
    userId,
    title: documentTitle.slice(0, 200),
    contentType: 'url',
    text: extraction.text,
    sourceUrl: data.url,
  });

  if (!result.success) {
    await markDocumentAsFailed(documentId, result.error ?? 'Content ingestion failed.');
    return NextResponse.json(
      { error: result.errorCode, message: result.error },
      { status: 422 },
    );
  }

  return NextResponse.json({
    documentId: result.documentId,
    chunkCount: result.chunkCount,
    status: result.status ?? 'ready',
    searchable: result.searchable ?? result.status === 'ready',
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

  // Reserve document slot atomically (quota-safe)
  const reservation = await reserveDocumentSlot({
    userId,
    title: data.title.slice(0, 200),
    contentType: 'text',
  });

  if (!reservation.success || !reservation.documentId) {
    if (reservation.errorCode === 'QUOTA_EXCEEDED') {
      return NextResponse.json(
        { error: 'QUOTA_EXCEEDED', message: reservation.error },
        { status: 429 },
      );
    }

    return NextResponse.json(
      { error: reservation.errorCode ?? 'INTERNAL_ERROR', message: reservation.error ?? 'Failed to reserve document slot.' },
      { status: 422 },
    );
  }

  const documentId = reservation.documentId;

  const result = await ingestContent({
    documentId,
    userId,
    title: data.title.slice(0, 200),
    contentType: 'text',
    text: sanitized,
  });

  if (!result.success) {
    await markDocumentAsFailed(documentId, result.error ?? 'Content ingestion failed.');
    return NextResponse.json(
      { error: result.errorCode, message: result.error },
      { status: 422 },
    );
  }

  return NextResponse.json({
    documentId: result.documentId,
    chunkCount: result.chunkCount,
    status: result.status ?? 'ready',
    searchable: result.searchable ?? result.status === 'ready',
  }, { status: 201 });
}
