/**
 * URL content extraction using Mozilla Readability.
 * Fetches web pages and extracts readable text content.
 */

import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

import {
  URL_FETCH_TIMEOUT_MS,
  URL_MAX_CONTENT_BYTES,
  URL_MIN_TEXT_LENGTH,
  URL_USER_AGENT,
} from './UrlConfig';
import { validateUrl } from './UrlValidator';

export type UrlExtractionResult = {
  success: boolean;
  text?: string;
  title?: string;
  byline?: string;
  siteName?: string;
  error?: string;
  errorCode?:
    | 'VALIDATION_FAILED'
    | 'FETCH_FAILED'
    | 'TIMEOUT'
    | 'TOO_LARGE'
    | 'NOT_HTML'
    | 'NO_CONTENT'
    | 'PARSE_FAILED';
};

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
 * Custom error for content too large.
 */
class ContentTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentTooLargeError';
  }
}

/**
 * Fetches URL content with timeout and size limits.
 * Does not follow redirects for security.
 * @param url - URL to fetch
 * @returns Response body as string
 */
async function fetchWithLimits(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'error', // Security: don't follow redirects
      headers: {
        'User-Agent': URL_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check content type
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      throw new Error('NOT_HTML');
    }

    // Check content length header if available
    const contentLength = response.headers.get('content-length');
    if (contentLength && Number.parseInt(contentLength, 10) > URL_MAX_CONTENT_BYTES) {
      throw new ContentTooLargeError('Content exceeds size limit');
    }

    // Stream and check size incrementally
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalSize += value.length;
      if (totalSize > URL_MAX_CONTENT_BYTES) {
        reader.cancel();
        throw new ContentTooLargeError('Content exceeds size limit');
      }

      chunks.push(value);
    }

    // Combine chunks and decode
    const combined = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    return new TextDecoder().decode(combined);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Extracts readable content from HTML using Mozilla Readability.
 * @param html - HTML content to parse
 * @returns Extraction result with text or error
 */
function extractReadableContent(html: string): UrlExtractionResult {
  try {
    // Parse HTML with linkedom
    const { document } = parseHTML(html);

    // Set document URL for relative link resolution
    // linkedom doesn't support setting URL directly, but Readability handles it

    // Create Readability instance and parse
    const reader = new Readability(document, {
      charThreshold: 100, // Minimum chars to consider content
    });

    const article = reader.parse();

    if (!article || !article.textContent) {
      return {
        success: false,
        error: 'No readable content found at this URL.',
        errorCode: 'NO_CONTENT',
      };
    }

    const text = article.textContent.trim();

    if (text.length < URL_MIN_TEXT_LENGTH) {
      return {
        success: false,
        error: 'No readable content found at this URL.',
        errorCode: 'NO_CONTENT',
      };
    }

    return {
      success: true,
      text,
      title: article.title || undefined,
      byline: article.byline || undefined,
      siteName: article.siteName || undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Parse failed';
    return {
      success: false,
      error: `Failed to parse content: ${message}`,
      errorCode: 'PARSE_FAILED',
    };
  }
}

/**
 * Fetches and extracts readable content from a URL.
 * Validates URL for SSRF, fetches with limits, and extracts text.
 * @param urlString - URL to extract content from
 * @returns Extraction result with text or error details
 */
export async function extractUrlContent(urlString: string): Promise<UrlExtractionResult> {
  // Step 1: Validate URL for SSRF
  const validation = await validateUrl(urlString);
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
      errorCode: 'VALIDATION_FAILED',
    };
  }

  // Step 2: Fetch content with limits
  let html: string;
  try {
    html = await fetchWithLimits(urlString);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'The URL took too long to respond.',
          errorCode: 'TIMEOUT',
        };
      }
      if (error instanceof TimeoutError) {
        return {
          success: false,
          error: 'The URL took too long to respond.',
          errorCode: 'TIMEOUT',
        };
      }
      if (error instanceof ContentTooLargeError) {
        return {
          success: false,
          error: 'The page content exceeds 5MB.',
          errorCode: 'TOO_LARGE',
        };
      }
      if (error.message === 'NOT_HTML') {
        return {
          success: false,
          error: 'URL does not point to an HTML page.',
          errorCode: 'NOT_HTML',
        };
      }
      // Handle redirect errors
      if (error.message.includes('redirect')) {
        return {
          success: false,
          error: 'URL redirects are not allowed for security.',
          errorCode: 'FETCH_FAILED',
        };
      }
    }

    return {
      success: false,
      error: 'Failed to fetch URL content.',
      errorCode: 'FETCH_FAILED',
    };
  }

  // Step 3: Extract readable content
  return extractReadableContent(html);
}

/**
 * Checks if a URL likely points to readable HTML content.
 * Quick check without full extraction.
 * @param urlString - URL to check
 * @returns True if URL likely has readable content
 */
export async function hasReadableContent(urlString: string): Promise<boolean> {
  const result = await extractUrlContent(urlString);
  return result.success;
}
