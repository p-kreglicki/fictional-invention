import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAnd = vi.fn((...conditions: unknown[]) => ({ type: 'and', conditions }));
const mockEq = vi.fn((column: unknown, value: unknown) => ({ type: 'eq', column, value }));

const mockRequireUser = vi.fn(async () => ({ id: 'user-1' }));
const mockDeleteDocument = vi.fn();
const mockFindFirst = vi.fn();

vi.mock('drizzle-orm', () => ({
  and: mockAnd,
  eq: mockEq,
}));

vi.mock('@/libs/Auth', () => ({
  requireUser: mockRequireUser,
}));

vi.mock('@/libs/ContentIngestion', () => ({
  deleteDocument: mockDeleteDocument,
}));

vi.mock('@/libs/DB', () => ({
  db: {
    query: {
      documentsSchema: {
        findFirst: mockFindFirst,
      },
    },
  },
}));

vi.mock('@/libs/Logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/models/Schema', () => ({
  documentsSchema: {
    id: 'documents.id',
    userId: 'documents.user_id',
  },
}));

describe('GET /api/documents/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when scoped document lookup misses', async () => {
    mockFindFirst.mockResolvedValue(undefined);
    const { GET } = await import('./route');

    const response = await GET(new Request('http://localhost/api/documents/doc-1'), {
      params: Promise.resolve({ id: 'doc-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('NOT_FOUND');
  });

  it('filters document lookup by id and authenticated user id', async () => {
    mockFindFirst.mockResolvedValue(undefined);
    const { GET } = await import('./route');

    await GET(new Request('http://localhost/api/documents/doc-1'), {
      params: Promise.resolve({ id: 'doc-1' }),
    });

    expect(mockEq).toHaveBeenCalledWith('documents.id', 'doc-1');
    expect(mockEq).toHaveBeenCalledWith('documents.user_id', 'user-1');
    expect(mockAnd).toHaveBeenCalledTimes(1);
    expect(mockFindFirst).toHaveBeenCalledTimes(1);
  });
});
