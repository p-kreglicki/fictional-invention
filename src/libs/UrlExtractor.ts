/**
 * URL content extraction using Mozilla Readability.
 * Fetches web pages and extracts readable text content.
 */

import type { LookupFunction } from 'node:net';
import { isIP } from 'node:net';

import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { Agent } from 'undici';

import {
  URL_FETCH_TIMEOUT_MS,
  URL_MAX_CONCURRENT_FETCHES,
  URL_MAX_CONTENT_BYTES,
  URL_MIN_TEXT_LENGTH,
  URL_USER_AGENT,
} from './UrlConfig';
import { validateUrl } from './UrlValidator';

export type UrlExtractionResult = {
  success: true;
  text: string;
  title?: string;
  byline?: string;
  siteName?: string;
  error?: undefined;
  errorCode?: undefined;
} | {
  success: false;
  error: string;
  errorCode:
    | 'VALIDATION_FAILED'
    | 'FETCH_FAILED'
    | 'TIMEOUT'
    | 'TOO_LARGE'
    | 'NOT_HTML'
    | 'NO_CONTENT'
    | 'PARSE_FAILED';
  text?: undefined;
  title?: undefined;
  byline?: undefined;
  siteName?: undefined;
};

/**
 * Custom error for content too large.
 */
class ContentTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentTooLargeError';
  }
}

class Semaphore {
  private available: number;
  private queue: Array<() => void> = [];

  constructor(capacity: number) {
    this.available = capacity;
  }

  private async acquire() {
    if (this.available > 0) {
      this.available -= 1;
      return;
    }

    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  private release() {
    const next = this.queue.shift();
    if (next) {
      next();
      return;
    }

    this.available += 1;
  }

  async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await operation();
    } finally {
      this.release();
    }
  }
}

const fetchSemaphore = new Semaphore(URL_MAX_CONCURRENT_FETCHES);

/**
 * Creates a DNS lookup function that only returns pre-validated IPs.
 * Prevents DNS rebinding by bypassing real DNS resolution at connect time.
 * @param hostname - Expected hostname for the request
 * @param allowedIps - Pre-validated IP addresses from SSRF check
 * @returns Lookup function that returns only allowed IPs
 */
export function createPinnedLookup(hostname: string, allowedIps: string[]): LookupFunction {
  return (lookupHost, options, callback) => {
    if (lookupHost !== hostname) {
      callback(new Error('Unexpected hostname in lookup'), '', 4);
      return;
    }

    const normalizedOptions: { family?: number | 'IPv4' | 'IPv6'; all?: boolean } = typeof options === 'number'
      ? { family: options }
      : options;
    const requestedFamily = normalizedOptions.family === 'IPv4'
      ? 4
      : normalizedOptions.family === 'IPv6'
        ? 6
        : normalizedOptions.family ?? 0;
    const candidates = allowedIps.filter((ip) => {
      const family = isIP(ip);
      return requestedFamily === 0 || family === requestedFamily;
    });

    if (normalizedOptions.all) {
      const addresses = candidates
        .map((ip) => {
          const family = isIP(ip);
          if (family !== 4 && family !== 6) {
            return null;
          }

          return {
            address: ip,
            family,
          };
        })
        .filter((value): value is { address: string; family: 4 | 6 } => value !== null);

      if (addresses.length === 0) {
        callback(new Error('No allowed IP for requested address family'), [], 0);
        return;
      }

      callback(null, addresses, 0);
      return;
    }

    const selected = candidates[0];
    if (!selected) {
      callback(new Error('No allowed IP for requested address family'), '', 4);
      return;
    }

    const family = isIP(selected);
    if (family !== 4 && family !== 6) {
      callback(new Error('Invalid IP address'), '', 4);
      return;
    }

    callback(null, selected, family);
  };
}

/**
 * Fetches URL content with timeout and size limits.
 * Uses DNS pinning to prevent rebinding attacks while preserving TLS/SNI.
 * @param url - URL to fetch
 * @param allowedIps - Pre-validated IP addresses to pin DNS to
 * @returns Response body as string
 */
async function fetchWithLimits(url: string, allowedIps: string[]): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);

  const parsedUrl = new URL(url);
  const dispatcher = new Agent({
    connect: { lookup: createPinnedLookup(parsedUrl.hostname, allowedIps) },
  });
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'error', // Security: don't follow redirects
      // @ts-expect-error dispatcher is valid for undici-backed fetch
      dispatcher,
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
    await dispatcher.close();
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
      error: validation.error ?? 'URL validation failed.',
      errorCode: 'VALIDATION_FAILED',
    };
  }

  // Use validated IPs for DNS pinning (prevents DNS rebinding)
  const allowedIps = validation.resolvedIps ?? [];
  if (allowedIps.length === 0) {
    return {
      success: false,
      error: 'No resolved IP address available',
      errorCode: 'VALIDATION_FAILED',
    };
  }

  // Step 2: Fetch content with DNS pinned to validated IPs
  let html: string;
  try {
    html = await fetchSemaphore.runExclusive(async () => fetchWithLimits(urlString, allowedIps));
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
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
