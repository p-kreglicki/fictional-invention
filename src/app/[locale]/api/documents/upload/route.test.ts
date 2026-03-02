import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireUser = vi.fn(async () => ({ id: 'user-1' }));
const mockReserveDocumentSlot = vi.fn();
const mockIngestContent = vi.fn();
const mockMarkDocumentAsFailed = vi.fn(async () => undefined);
const mockProtect = vi.fn();
const mockWithRule = vi.fn(() => ({
  protect: mockProtect,
}));
const mockFixedWindow = vi.fn(() => []);

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
  processPdf: vi.fn(),
}));

vi.mock('@/libs/UrlExtractor', () => ({
  extractUrlContent: vi.fn(),
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

describe('POST /api/documents/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProtect.mockResolvedValue({
      isDenied: () => false,
      reason: { isRateLimit: () => false },
      results: [],
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

    mockIngestContent.mockImplementation(async (input: { documentId: string }) => ({
      success: true,
      documentId: input.documentId,
      chunkCount: 1,
      status: 'ready',
      searchable: true,
    }));

    const { POST } = await import('./route');

    const [firstResponse, secondResponse] = await Promise.all([
      POST(createTextUploadRequest()),
      POST(createTextUploadRequest()),
    ]);

    const statuses = [firstResponse.status, secondResponse.status].sort((a, b) => a - b);
    const firstBody = await firstResponse.json();
    const secondBody = await secondResponse.json();
    const successBody = firstResponse.status === 201 ? firstBody : secondBody;

    expect(statuses).toEqual([201, 429]);
    expect(mockIngestContent).toHaveBeenCalledTimes(1);
    expect(successBody.status).toBe('ready');
    expect(successBody.searchable).toBe(true);
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

    const { POST } = await import('./route');
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
});
