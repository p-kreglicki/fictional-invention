/**
 * PDF text extraction using unpdf.
 * Optimized for serverless environments with proper cleanup.
 */

import { Buffer } from 'node:buffer';

import { extractText, getDocumentProxy } from 'unpdf';

// Minimum text content to consider a PDF as having extractable text
const MIN_TEXT_LENGTH = 10;

// Maximum number of pages allowed (security limit)
const MAX_PAGE_COUNT = 100;

// Timeout for PDF parsing operations (30 seconds)
const PARSING_TIMEOUT_MS = 30_000;

/**
 * Custom error for timeout scenarios.
 */
class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Wraps a promise with a timeout.
 * @param promise - Promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @returns Promise that rejects with TimeoutError if timeout exceeded
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

export type PdfExtractionResult = {
  success: boolean;
  text?: string;
  pageCount?: number;
  error?: string;
  errorCode?: 'PASSWORD_PROTECTED' | 'NO_TEXT' | 'EXTRACTION_FAILED' | 'PAGE_LIMIT_EXCEEDED' | 'TIMEOUT';
};

/**
 * Extracts text content from a PDF buffer.
 * Handles password-protected and image-only PDFs gracefully.
 * @param buffer - Raw PDF file buffer
 * @returns Extraction result with text or error details
 */
export async function extractPdfText(
  buffer: Buffer | Uint8Array,
): Promise<PdfExtractionResult> {
  let proxy = null;

  try {
    // Convert to Uint8Array (unpdf requires Uint8Array, not Buffer)
    const data = buffer instanceof Uint8Array && !Buffer.isBuffer(buffer)
      ? buffer
      : new Uint8Array(buffer);

    // Get document proxy for cleanup (with timeout)
    proxy = await withTimeout(getDocumentProxy(data), PARSING_TIMEOUT_MS);

    // Check page count limit before extraction (security)
    if (proxy.numPages > MAX_PAGE_COUNT) {
      return {
        success: false,
        pageCount: proxy.numPages,
        error: `PDF exceeds ${MAX_PAGE_COUNT} page limit.`,
        errorCode: 'PAGE_LIMIT_EXCEEDED',
      };
    }

    // Extract text from all pages (with timeout)
    const result = await withTimeout(
      extractText(proxy, { mergePages: true }),
      PARSING_TIMEOUT_MS,
    );

    // Check for image-only PDF (no extractable text)
    const text = typeof result.text === 'string' ? result.text.trim() : '';

    if (text.length < MIN_TEXT_LENGTH) {
      return {
        success: false,
        pageCount: result.totalPages,
        error: 'No text could be extracted from this PDF. It may be image-only.',
        errorCode: 'NO_TEXT',
      };
    }

    return {
      success: true,
      text,
      pageCount: result.totalPages,
    };
  } catch (error) {
    // Handle timeout
    if (error instanceof TimeoutError) {
      return {
        success: false,
        error: 'PDF parsing timed out.',
        errorCode: 'TIMEOUT',
      };
    }

    // Handle specific PDF.js errors
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Password-protected PDF detection
    if (
      errorMessage.includes('password')
      || errorMessage.includes('Password')
      || errorMessage.includes('encrypted')
    ) {
      return {
        success: false,
        error: 'Password-protected PDFs are not supported.',
        errorCode: 'PASSWORD_PROTECTED',
      };
    }

    // General extraction failure
    return {
      success: false,
      error: 'Failed to extract text from PDF.',
      errorCode: 'EXTRACTION_FAILED',
    };
  } finally {
    // Cleanup: destroy the document proxy to free memory
    if (proxy) {
      try {
        proxy.destroy();
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Checks if a PDF buffer contains extractable text.
 * Lightweight check without full extraction.
 * @param buffer - Raw PDF file buffer
 * @returns True if PDF likely contains text
 */
export async function hasExtractableText(
  buffer: Buffer | Uint8Array,
): Promise<boolean> {
  const result = await extractPdfText(buffer);
  return result.success;
}
