import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockHeaders = vi.fn();
const mockVerify = vi.fn();
const mockDeleteUserAccountByClerkId = vi.fn();

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}));

vi.mock('svix', () => ({
  Webhook: class {
    verify(body: string, headers: Record<string, string>) {
      return mockVerify(body, headers);
    }
  },
}));

vi.mock('@/libs/AccountDeletion', () => ({
  deleteUserAccountByClerkId: mockDeleteUserAccountByClerkId,
}));

vi.mock('@/libs/DB', () => ({
  db: {
    query: {
      usersSchema: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(),
  },
}));

vi.mock('@/libs/Env', () => ({
  Env: {
    CLERK_WEBHOOK_SECRET: 'whsec_test',
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

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
}));

vi.mock('@/models/Schema', () => ({
  usersSchema: {
    clerkId: 'users.clerk_id',
  },
}));

function createRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/webhooks/clerk', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/webhooks/clerk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers({
      'svix-id': 'msg_1',
      'svix-timestamp': '1234567890',
      'svix-signature': 'signature',
    }));
    mockVerify.mockReturnValue({
      type: 'user.deleted',
      data: { id: 'clerk_123' },
    });
    mockDeleteUserAccountByClerkId.mockResolvedValue('deleted');
  });

  it('returns 200 when account deletion succeeds', async () => {
    const { POST } = await import('./route');

    const response = await POST(createRequest({
      type: 'user.deleted',
      data: { id: 'clerk_123' },
    }));

    expect(response.status).toBe(200);
    expect(mockDeleteUserAccountByClerkId).toHaveBeenCalledWith('clerk_123');
  });

  it('returns 200 when the user is already absent', async () => {
    mockDeleteUserAccountByClerkId.mockResolvedValueOnce('not_found');
    const { POST } = await import('./route');

    const response = await POST(createRequest({
      type: 'user.deleted',
      data: { id: 'clerk_123' },
    }));

    expect(response.status).toBe(200);
    expect(mockDeleteUserAccountByClerkId).toHaveBeenCalledWith('clerk_123');
  });

  it('returns 500 so Clerk can retry when cleanup fails', async () => {
    mockDeleteUserAccountByClerkId.mockResolvedValueOnce('failed');
    const { POST } = await import('./route');

    const response = await POST(createRequest({
      type: 'user.deleted',
      data: { id: 'clerk_123' },
    }));

    expect(response.status).toBe(500);
  });
});
