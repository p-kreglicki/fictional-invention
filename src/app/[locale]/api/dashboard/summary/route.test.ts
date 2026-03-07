import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireUser = vi.fn(async () => ({ id: 'user-1' }));
const mockSelect = vi.fn();
const mockExecute = vi.fn();

class MockAuthenticationError extends Error {}
class MockUserNotFoundError extends Error {}

vi.mock('@/libs/Auth', () => ({
  requireUser: mockRequireUser,
  AuthenticationError: MockAuthenticationError,
  UserNotFoundError: MockUserNotFoundError,
}));

vi.mock('@/libs/DB', () => ({
  db: {
    select: mockSelect,
    execute: mockExecute,
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

function createGroupedSelectResult(result: unknown) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        groupBy: vi.fn(async () => result),
      })),
    })),
  };
}

function createWhereSelectResult(result: unknown) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(async () => result),
    })),
  };
}

describe('GET /api/dashboard/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns aggregated dashboard counts and recent average score', async () => {
    mockSelect
      .mockReturnValueOnce(createGroupedSelectResult([
        { status: 'ready', count: 2 },
        { status: 'failed', count: 1 },
      ]))
      .mockReturnValueOnce(createWhereSelectResult([{ count: 3 }]));
    mockExecute.mockResolvedValue({
      rows: [{ recentAverageScore: 88 }],
    });

    const { GET } = await import('./route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.documentCounts.total).toBe(3);
    expect(body.documentCounts.ready).toBe(2);
    expect(body.documentCounts.failed).toBe(1);
    expect(body.activeGenerationJobsCount).toBe(3);
    expect(body.recentAverageScore).toBe(88);
  });

  it('returns 401 when authentication fails', async () => {
    mockRequireUser.mockRejectedValueOnce(new MockAuthenticationError('missing'));

    const { GET } = await import('./route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('UNAUTHORIZED');
  });
});
