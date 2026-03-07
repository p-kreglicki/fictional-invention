import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireUser = vi.fn(async () => ({ id: 'user-1' }));
const mockProtect = vi.fn();
const mockWithRule = vi.fn(() => ({
  protect: mockProtect,
}));
const mockFixedWindow = vi.fn(() => []);
const mockSelect = vi.fn();
const mockEnv = {
  ARCJET_KEY: 'ajkey_test' as string | undefined,
  RESPONSE_RATE_LIMIT_MAX_REQUESTS: 30,
  RESPONSE_RATE_LIMIT_WINDOW_SECONDS: 60,
  NODE_ENV: 'test' as 'production' | 'test',
};

class MockAuthenticationError extends Error {}
class MockUserNotFoundError extends Error {}

vi.mock('@/libs/Auth', () => ({
  requireUser: mockRequireUser,
  AuthenticationError: MockAuthenticationError,
  UserNotFoundError: MockUserNotFoundError,
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
  Env: mockEnv,
}));

vi.mock('@/libs/DB', () => ({
  db: {
    select: mockSelect,
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

function createJoinSelectResult(result: unknown) {
  return {
    select: mockSelect,
    from: vi.fn(() => ({
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => result),
          })),
        })),
      })),
    })),
  };
}

function createWhereSelectResult(result: unknown) {
  return {
    select: mockSelect,
    from: vi.fn(() => ({
      where: vi.fn(async () => result),
    })),
  };
}

describe('GET /api/responses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.ARCJET_KEY = 'ajkey_test';
    mockProtect.mockResolvedValue({
      isDenied: () => false,
      reason: { isRateLimit: () => false },
      results: [],
    });
  });

  it('returns paginated response history with trend and filter documents', async () => {
    mockSelect
      .mockReturnValueOnce(createJoinSelectResult([
        {
          id: '550e8400-e29b-41d4-a716-446655440010',
          exerciseId: '550e8400-e29b-41d4-a716-446655440020',
          exerciseType: 'single_answer',
          score: 84,
          overallFeedback: 'Strong answer.',
          createdAt: new Date('2026-03-06T10:00:00.000Z'),
          sourceDocumentIds: ['550e8400-e29b-41d4-a716-446655440030'],
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440011',
          exerciseId: '550e8400-e29b-41d4-a716-446655440021',
          exerciseType: 'fill_gap',
          score: 76,
          overallFeedback: 'Watch verb agreement.',
          createdAt: new Date('2026-03-05T10:00:00.000Z'),
          sourceDocumentIds: ['550e8400-e29b-41d4-a716-446655440031'],
        },
      ]))
      .mockReturnValueOnce(createJoinSelectResult([
        {
          createdAt: new Date('2026-03-06T10:00:00.000Z'),
          score: 84,
        },
        {
          createdAt: new Date('2026-03-05T10:00:00.000Z'),
          score: 76,
        },
      ]))
      .mockReturnValueOnce(createJoinSelectResult([
        {
          sourceDocumentIds: ['550e8400-e29b-41d4-a716-446655440030'],
        },
        {
          sourceDocumentIds: ['550e8400-e29b-41d4-a716-446655440031'],
        },
      ]))
      .mockReturnValueOnce(createWhereSelectResult([
        {
          id: '550e8400-e29b-41d4-a716-446655440030',
          title: 'Lesson notes',
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440031',
          title: 'Reading article',
        },
      ]));

    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/responses?limit=1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].documents[0].title).toBe('Lesson notes');
    expect(body.availableDocuments).toHaveLength(2);
    expect(body.trend.averageScore).toBe(80);
    expect(body.pageInfo.nextCursor).toEqual(expect.any(String));
  });

  it('returns 422 for oversized limit values', async () => {
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/responses?limit=101'));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe('INVALID_REQUEST');
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
