import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireUser = vi.fn(async () => ({ id: 'user-1' }));
const mockReserveDocumentSlot = vi.fn();
const mockIngestContent = vi.fn();
const mockMarkDocumentAsFailed = vi.fn(async () => undefined);
const mockProcessPdf = vi.fn();
const mockExtractUrlContent = vi.fn();
const mockProtect = vi.fn();
const mockWithRule = vi.fn(() => ({
  protect: mockProtect,
}));
const mockFixedWindow = vi.fn(() => []);
let nextDocumentId = 0;

vi.mock('@/libs/Auth', () => ({
  requireUser: mockRequireUser,
}));

vi.mock('@arcjet/next', () => ({
  fixedWindow: mockFixedWindow,
}));

vi.mock('@/libs/Arcjet', () => ({
  default: {
    withRule: mockWithRule,
  },
}));

vi.mock('@/libs/Env', () => ({
  Env: {
    ARCJET_KEY: 'ajkey_test',
    UPLOAD_RATE_LIMIT_MAX_REQUESTS: 10,
    UPLOAD_RATE_LIMIT_WINDOW_SECONDS: 60,
  },
}));

vi.mock('@/libs/ContentIngestion', () => ({
  reserveDocumentSlot: mockReserveDocumentSlot,
  ingestContent: mockIngestContent,
  markDocumentAsFailed: mockMarkDocumentAsFailed,
}));

vi.mock('@/libs/PdfExtractor', () => ({
  processPdf: mockProcessPdf,
}));

vi.mock('@/libs/UrlExtractor', () => ({
  extractUrlContent: mockExtractUrlContent,
}));

vi.mock('@/libs/Sanitizer', () => ({
  sanitizeText: (text: string) => text,
}));

vi.mock('@/libs/Logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function createTextUploadRequest() {
  return new Request('http://localhost/api/documents/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'text',
      title: 'Sample title',
      content: 'a'.repeat(120),
    }),
  });
}

function createUrlUploadRequest() {
  return new Request('http://localhost/api/documents/upload', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'url',
      title: 'Example URL',
      url: 'https://example.com/article',
    }),
  });
}

async function flushDeferredScheduler() {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  await Promise.resolve();
  await Promise.resolve();
}

async function loadRouteModule() {
  vi.resetModules();
  return import('./route');
}

describe('POST /api/documents/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    nextDocumentId = 0;
    mockProtect.mockResolvedValue({
      isDenied: () => false,
      reason: { isRateLimit: () => false },
      results: [],
    });
    mockReserveDocumentSlot.mockImplementation(async () => ({
      success: true,
      documentId: `doc-${++nextDocumentId}`,
    }));
    mockIngestContent.mockImplementation(async (input: { documentId: string }) => ({
      success: true,
      documentId: input.documentId,
      chunkCount: 1,
      status: 'ready',
      searchable: true,
    }));
    mockProcessPdf.mockResolvedValue({
      success: true,
      text: 'Extracted PDF text',
    });
    mockExtractUrlContent.mockResolvedValue({
      success: true,
      text: 'Extracted URL text',
      title: 'Example URL',
    });
  });

  it('returns one success and one quota error under concurrent near-quota requests', async () => {
    let currentCount = 49;

    mockReserveDocumentSlot.mockImplementation(async () => {
      if (currentCount >= 50) {
        return {
          success: false,
          errorCode: 'QUOTA_EXCEEDED',
          error: 'Quota exceeded',
        };
      }
      currentCount += 1;
      return {
        success: true,
        documentId: `doc-${currentCount}`,
      };
    });

    const { POST } = await loadRouteModule();
    const [firstResponse, secondResponse] = await Promise.all([
      POST(createTextUploadRequest()),
      POST(createTextUploadRequest()),
    ]);

    const statuses = [firstResponse.status, secondResponse.status].sort((a, b) => a - b);
    const firstBody = await firstResponse.json();
    const secondBody = await secondResponse.json();
    const successBody = firstResponse.status === 202 ? firstBody : secondBody;

    expect(statuses).toEqual([202, 429]);
    expect(successBody.status).toBe('uploading');
    expect(successBody.searchable).toBe(false);
    expect(mockIngestContent).not.toHaveBeenCalled();

    await flushDeferredScheduler();

    expect(mockIngestContent).toHaveBeenCalledTimes(1);
  });

  it('returns 429 with rate limit headers when upload limiter denies request', async () => {
    mockProtect.mockResolvedValue({
      isDenied: () => true,
      reason: {
        isRateLimit: () => true,
        max: 10,
        remaining: 0,
        reset: 60,
      },
      results: [],
    });

    const { POST } = await loadRouteModule();
    const response = await POST(createTextUploadRequest());
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBe('RATE_LIMIT_EXCEEDED');
    expect(response.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(response.headers.get('X-RateLimit-Reset')).toBe('60');
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(mockReserveDocumentSlot).not.toHaveBeenCalled();
  });

  it('returns 202 before starting URL extraction', async () => {
    const { POST } = await loadRouteModule();

    const response = await POST(createUrlUploadRequest());
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.status).toBe('uploading');
    expect(mockExtractUrlContent).not.toHaveBeenCalled();

    await flushDeferredScheduler();

    expect(mockExtractUrlContent).toHaveBeenCalledTimes(1);
    expect(mockExtractUrlContent).toHaveBeenCalledWith('https://example.com/article');
  });

  it('drains queued uploads in FIFO order as active slots free up', async () => {
    const startedDocumentIds: string[] = [];
    const pendingResolutions = new Map<string, () => void>();
    const queuedRequestCount = 13;

    mockIngestContent.mockImplementation((input: { documentId: string }) => {
      startedDocumentIds.push(input.documentId);

      return new Promise((resolve) => {
        pendingResolutions.set(input.documentId, () => {
          resolve({
            success: true,
            documentId: input.documentId,
            chunkCount: 1,
            status: 'ready',
            searchable: true,
          });
        });
      });
    });

    const { POST } = await loadRouteModule();

    const responses = await Promise.all(
      Array.from({ length: queuedRequestCount }, () => POST(createTextUploadRequest())),
    );

    expect(responses.every(response => response.status === 202)).toBe(true);
    expect(mockIngestContent).not.toHaveBeenCalled();

    await flushDeferredScheduler();

    expect(startedDocumentIds).toEqual([
      'doc-1',
      'doc-2',
      'doc-3',
      'doc-4',
      'doc-5',
      'doc-6',
      'doc-7',
      'doc-8',
      'doc-9',
      'doc-10',
    ]);

    async function completeJob(documentId: string) {
      const resolve = pendingResolutions.get(documentId);

      expect(resolve).toBeDefined();

      pendingResolutions.delete(documentId);
      resolve?.();
      await Promise.resolve();
      await Promise.resolve();
      await flushDeferredScheduler();
    }

    await completeJob('doc-1');

    expect(startedDocumentIds).toEqual([
      'doc-1',
      'doc-2',
      'doc-3',
      'doc-4',
      'doc-5',
      'doc-6',
      'doc-7',
      'doc-8',
      'doc-9',
      'doc-10',
      'doc-11',
    ]);

    await completeJob('doc-2');

    expect(startedDocumentIds).toEqual([
      'doc-1',
      'doc-2',
      'doc-3',
      'doc-4',
      'doc-5',
      'doc-6',
      'doc-7',
      'doc-8',
      'doc-9',
      'doc-10',
      'doc-11',
      'doc-12',
    ]);

    await completeJob('doc-3');

    expect(startedDocumentIds).toEqual([
      'doc-1',
      'doc-2',
      'doc-3',
      'doc-4',
      'doc-5',
      'doc-6',
      'doc-7',
      'doc-8',
      'doc-9',
      'doc-10',
      'doc-11',
      'doc-12',
      'doc-13',
    ]);

    for (const [documentId, resolve] of pendingResolutions) {
      pendingResolutions.delete(documentId);
      resolve();
    }

    await Promise.resolve();
    await Promise.resolve();
    await flushDeferredScheduler();
  });
});
