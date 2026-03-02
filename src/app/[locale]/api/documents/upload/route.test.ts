import { describe, expect, it, vi } from 'vitest';

const mockRequireUser = vi.fn(async () => ({ id: 'user-1' }));
const mockReserveDocumentSlot = vi.fn();
const mockIngestContent = vi.fn();
const mockMarkDocumentAsFailed = vi.fn(async () => undefined);

vi.mock('@/libs/Auth', () => ({
  requireUser: mockRequireUser,
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
});
