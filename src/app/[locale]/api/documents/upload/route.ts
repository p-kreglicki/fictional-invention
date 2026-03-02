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
const MAX_CONCURRENT_DEFERRED_JOBS = 10;
const QUEUE_WARNING_THRESHOLD = 20;

const uploadRateLimiter = arcjet.withRule(
  fixedWindow({
    mode: 'LIVE',
    max: UPLOAD_RATE_LIMIT_MAX_REQUESTS,
    window: `${UPLOAD_RATE_LIMIT_WINDOW_SECONDS}s`,
    characteristics: ['userId'],
  }),
);

type DeferredExtractionResult = {
  success: true;
  text: string;
  title?: string;
} | {
  success: false;
  error: string;
};

type DeferredUploadJob = {
  documentId: string;
  userId: string;
  title: string;
  contentType: 'pdf' | 'url' | 'text';
  sourceUrl?: string;
  originalFilename?: string;
  extractText: () => Promise<DeferredExtractionResult>;
};

let activeJobs = 0;
const pendingJobs: DeferredUploadJob[] = [];

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
 * Builds a quota reservation failure response.
 * @param input - Reservation error details
 * @param input.errorCode - Machine-readable reservation error code
 * @param input.error - User-facing reservation error message
 * @returns API response for the reservation failure
 */
function createReservationErrorResponse(input: {
  errorCode?: string;
  error?: string;
}) {
  if (input.errorCode === 'QUOTA_EXCEEDED') {
    return NextResponse.json(
      { error: 'QUOTA_EXCEEDED', message: input.error },
      { status: 429 },
    );
  }

  return NextResponse.json(
    { error: input.errorCode ?? 'INTERNAL_ERROR', message: input.error ?? 'Failed to reserve document slot.' },
    { status: 422 },
  );
}

/**
 * Builds the accepted upload response for async processing.
 * @param documentId - Reserved document ID
 * @returns API response with accepted status
 */
function createAcceptedUploadResponse(documentId: string) {
  return NextResponse.json({
    documentId,
    chunkCount: 0,
    status: 'uploading',
    searchable: false,
  }, { status: 202 });
}

/**
 * Updates a queued document to failed while swallowing secondary failures.
 * @param documentId - Reserved document ID
 * @param message - User-facing failure message
 * @returns Promise that resolves when failure status update is attempted
 */
async function failDeferredDocument(documentId: string, message: string) {
  try {
    await markDocumentAsFailed(documentId, message);
  } catch (error) {
    logger.error('Failed to mark deferred document as failed', { documentId, error });
  }
}

/**
 * Processes a deferred upload job and drains the pending queue.
 * @param input - Deferred upload metadata and extraction callback
 * @returns Promise that resolves when processing completes
 */
async function runDeferredUpload(input: DeferredUploadJob) {
  try {
    const extraction = await input.extractText();
    if (!extraction.success) {
      await failDeferredDocument(input.documentId, extraction.error);
      return;
    }

    const result = await ingestContent({
      documentId: input.documentId,
      userId: input.userId,
      title: extraction.title?.slice(0, 200) ?? input.title,
      contentType: input.contentType,
      text: extraction.text,
      sourceUrl: input.sourceUrl,
      originalFilename: input.originalFilename,
    });

    if (!result.success) {
      await failDeferredDocument(input.documentId, result.error ?? 'Content ingestion failed.');
    }
  } catch (error) {
    logger.error('Deferred upload processing failed', {
      documentId: input.documentId,
      contentType: input.contentType,
      error,
    });
    await failDeferredDocument(input.documentId, 'An unexpected error occurred during processing.');
  } finally {
    activeJobs--;
    logger.info('Deferred job completed', {
      activeJobs,
      pendingJobs: pendingJobs.length,
    });

    const next = pendingJobs.shift();
    if (next) {
      startDeferredJob(next);
    }
  }
}

/**
 * Starts a deferred job immediately, incrementing the active count.
 * @param input - Deferred upload job payload
 */
function startDeferredJob(input: DeferredUploadJob) {
  activeJobs++;
  logger.info('Deferred job started', {
    documentId: input.documentId,
    contentType: input.contentType,
    activeJobs,
    pendingJobs: pendingJobs.length,
  });

  setTimeout(() => {
    void runDeferredUpload(input);
  }, 0);
}

/**
 * Queues a deferred upload job with bounded concurrency.
 * @param input - Deferred upload job payload
 */
function queueDeferredUpload(input: DeferredUploadJob) {
  if (activeJobs < MAX_CONCURRENT_DEFERRED_JOBS) {
    startDeferredJob(input);
    return;
  }

  pendingJobs.push(input);
  logger.info('Deferred job queued', {
    documentId: input.documentId,
    activeJobs,
    pendingJobs: pendingJobs.length,
  });

  if (pendingJobs.length >= QUEUE_WARNING_THRESHOLD) {
    logger.warn('Deferred job queue growing large', {
      pendingJobs: pendingJobs.length,
      activeJobs,
    });
  }
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
    } else {
      logger.warn('Upload rate limiting disabled - ARCJET_KEY not configured');
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
    return createReservationErrorResponse({
      errorCode: reservation.errorCode,
      error: reservation.error,
    });
  }

  const documentId = reservation.documentId;
  const buffer = Buffer.from(await file.arrayBuffer());

  queueDeferredUpload({
    documentId,
    userId,
    title: documentTitle,
    contentType: 'pdf',
    originalFilename: file.name,
    extractText: async () => {
      const extraction = await processPdf(buffer);
      if (!extraction.success) {
        return {
          success: false,
          error: extraction.error ?? 'Failed to process PDF.',
        };
      }

      return {
        success: true,
        text: extraction.text,
      };
    },
  });

  return createAcceptedUploadResponse(documentId);
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
    return createReservationErrorResponse({
      errorCode: reservation.errorCode,
      error: reservation.error,
    });
  }

  const documentId = reservation.documentId;

  queueDeferredUpload({
    documentId,
    userId,
    title: fallbackTitle.slice(0, 200),
    contentType: 'url',
    sourceUrl: data.url,
    extractText: async () => {
      const extraction = await extractUrlContent(data.url);
      if (!extraction.success) {
        return {
          success: false,
          error: extraction.error ?? 'Failed to extract URL content.',
        };
      }

      return {
        success: true,
        text: extraction.text,
        title: data.title || extraction.title || new URL(data.url).hostname,
      };
    },
  });

  return createAcceptedUploadResponse(documentId);
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
    return createReservationErrorResponse({
      errorCode: reservation.errorCode,
      error: reservation.error,
    });
  }

  const documentId = reservation.documentId;
  queueDeferredUpload({
    documentId,
    userId,
    title: data.title.slice(0, 200),
    contentType: 'text',
    extractText: async () => ({
      success: true,
      text: sanitized,
    }),
  });

  return createAcceptedUploadResponse(documentId);
}
