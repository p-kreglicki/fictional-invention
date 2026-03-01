import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { extractUrlContent, hasReadableContent } from './UrlExtractor';
import * as UrlValidator from './UrlValidator';

// Mock the URL validator
vi.mock('./UrlValidator', () => ({
  validateUrl: vi.fn(),
}));

const mockValidateUrl = vi.mocked(UrlValidator.validateUrl);

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Helper to create a mock response
function createMockResponse(options: {
  body: string;
  status?: number;
  contentType?: string;
  contentLength?: string;
}) {
  const { body, status = 200, contentType = 'text/html', contentLength } = options;

  const headers = new Headers();
  headers.set('content-type', contentType);
  if (contentLength) {
    headers.set('content-length', contentLength);
  }

  // Create a readable stream from the body
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(body);

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(uint8Array);
      controller.close();
    },
  });

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers,
    body: stream,
  };
}

// Sample HTML with readable content
const READABLE_HTML = `
<!DOCTYPE html>
<html>
<head><title>Test Article</title></head>
<body>
  <article>
    <h1>Test Article Title</h1>
    <p>This is a test article with enough content to be considered readable.
    It contains multiple sentences and paragraphs to ensure the Readability
    algorithm considers it as valid content. The article discusses various
    topics and provides valuable information to the reader.</p>
    <p>Another paragraph with more content to ensure we have enough text
    for extraction. This helps validate that our content extraction is
    working properly and meeting the minimum text length requirements.</p>
  </article>
</body>
</html>
`;

// Minimal HTML without readable content
const EMPTY_HTML = `
<!DOCTYPE html>
<html>
<head><title>Empty Page</title></head>
<body>
  <nav>Menu</nav>
  <footer>Footer</footer>
</body>
</html>
`;

beforeEach(() => {
  vi.resetAllMocks();
  // Default: URL validation passes
  mockValidateUrl.mockResolvedValue({ valid: true, resolvedIps: ['93.184.216.34'] });
});

afterEach(() => {
  vi.resetAllMocks();
});

describe('extractUrlContent', () => {
  it('extracts text from readable HTML page', async () => {
    mockFetch.mockResolvedValue(createMockResponse({ body: READABLE_HTML }));

    const result = await extractUrlContent('https://example.com/article');

    expect(result.success).toBe(true);
    expect(result.text).toContain('test article');
    expect(result.title).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it('returns validation error for blocked URL', async () => {
    mockValidateUrl.mockResolvedValue({
      valid: false,
      error: 'URL resolves to blocked IP address',
    });

    const result = await extractUrlContent('https://internal.corp');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('VALIDATION_FAILED');
    expect(result.error).toBe('URL resolves to blocked IP address');
  });

  it('rejects non-HTML content', async () => {
    mockFetch.mockResolvedValue(createMockResponse({
      body: '{"data": "json"}',
      contentType: 'application/json',
    }));

    const result = await extractUrlContent('https://api.example.com/data');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('NOT_HTML');
    expect(result.error).toBe('URL does not point to an HTML page.');
  });

  it('rejects content exceeding size limit via header', async () => {
    mockFetch.mockResolvedValue(createMockResponse({
      body: READABLE_HTML,
      contentLength: '10000000', // 10MB
    }));

    const result = await extractUrlContent('https://example.com/large');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('TOO_LARGE');
    expect(result.error).toBe('The page content exceeds 5MB.');
  });

  it('handles fetch timeout', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValue(abortError);

    const result = await extractUrlContent('https://slow.example.com');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('TIMEOUT');
    expect(result.error).toBe('The URL took too long to respond.');
  });

  it('handles HTTP errors', async () => {
    mockFetch.mockResolvedValue(createMockResponse({
      body: 'Not Found',
      status: 404,
    }));

    const result = await extractUrlContent('https://example.com/missing');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('FETCH_FAILED');
  });

  it('returns NO_CONTENT for pages without readable text', async () => {
    mockFetch.mockResolvedValue(createMockResponse({ body: EMPTY_HTML }));

    const result = await extractUrlContent('https://example.com/empty');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('NO_CONTENT');
    expect(result.error).toBe('No readable content found at this URL.');
  });

  it('rejects redirects', async () => {
    const redirectError = new Error('redirect mode is set to error');
    mockFetch.mockRejectedValue(redirectError);

    const result = await extractUrlContent('https://redirect.example.com');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('FETCH_FAILED');
    expect(result.error).toContain('redirect');
  });

  it('accepts XHTML content type', async () => {
    mockFetch.mockResolvedValue(createMockResponse({
      body: READABLE_HTML,
      contentType: 'application/xhtml+xml',
    }));

    const result = await extractUrlContent('https://example.com/xhtml');

    expect(result.success).toBe(true);
    expect(result.text).toBeDefined();
  });
});

describe('hasReadableContent', () => {
  it('returns true for pages with readable content', async () => {
    mockFetch.mockResolvedValue(createMockResponse({ body: READABLE_HTML }));

    const result = await hasReadableContent('https://example.com/article');

    expect(result).toBe(true);
  });

  it('returns false for pages without readable content', async () => {
    mockFetch.mockResolvedValue(createMockResponse({ body: EMPTY_HTML }));

    const result = await hasReadableContent('https://example.com/empty');

    expect(result).toBe(false);
  });

  it('returns false for validation failures', async () => {
    mockValidateUrl.mockResolvedValue({
      valid: false,
      error: 'Only HTTPS URLs are allowed',
    });

    const result = await hasReadableContent('http://example.com');

    expect(result).toBe(false);
  });
});
