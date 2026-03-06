import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  user: { id: 'user-1', clerkId: 'clerk_1' } as { id: string; clerkId: string } | undefined,
  documents: [{ id: 'doc-1' }, { id: 'doc-2' }] as Array<{ id: string }>,
  deleteUserRows: [{ id: 'user-1' }] as Array<{ id: string }>,
  helperResults: [true, true] as boolean[],
  steps: [] as string[],
};

const mockFindFirst = vi.fn();
const mockDeleteDocumentForAccountDeletion = vi.fn(async (documentId: string) => {
  state.steps.push(`document:${documentId}`);
  return state.helperResults.shift() ?? true;
});
const mockDeleteReturning = vi.fn(async () => {
  state.steps.push('user-delete');
  return state.deleteUserRows;
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
}));

vi.mock('./ContentIngestion', () => ({
  deleteDocumentForAccountDeletion: mockDeleteDocumentForAccountDeletion,
}));

vi.mock('./DB', () => ({
  db: {
    query: {
      usersSchema: {
        findFirst: mockFindFirst,
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => state.documents),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: mockDeleteReturning,
      })),
    })),
  },
}));

vi.mock('./Logger', () => ({
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
  usersSchema: {
    id: 'users.id',
    clerkId: 'users.clerk_id',
  },
}));

describe('deleteUserAccountByClerkId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.user = { id: 'user-1', clerkId: 'clerk_1' };
    state.documents = [{ id: 'doc-1' }, { id: 'doc-2' }];
    state.deleteUserRows = [{ id: 'user-1' }];
    state.helperResults = [true, true];
    state.steps = [];
    mockFindFirst.mockResolvedValue(state.user);
  });

  it('returns not_found when the local user does not exist', async () => {
    mockFindFirst.mockResolvedValueOnce(undefined);
    const { deleteUserAccountByClerkId } = await import('./AccountDeletion');

    const result = await deleteUserAccountByClerkId('clerk_missing');

    expect(result).toBe('not_found');
    expect(mockDeleteDocumentForAccountDeletion).not.toHaveBeenCalled();
  });

  it('deletes documents before deleting the user row', async () => {
    const { deleteUserAccountByClerkId } = await import('./AccountDeletion');

    const result = await deleteUserAccountByClerkId('clerk_1');

    expect(result).toBe('deleted');
    expect(state.steps).toEqual(['document:doc-1', 'document:doc-2', 'user-delete']);
  });

  it('returns failed when document cleanup fails', async () => {
    state.helperResults = [true, false];
    const { deleteUserAccountByClerkId } = await import('./AccountDeletion');

    const result = await deleteUserAccountByClerkId('clerk_1');

    expect(result).toBe('failed');
    expect(state.steps).toEqual(['document:doc-1', 'document:doc-2']);
  });

  it('returns failed when the user row is not deleted', async () => {
    state.deleteUserRows = [];
    const { deleteUserAccountByClerkId } = await import('./AccountDeletion');

    const result = await deleteUserAccountByClerkId('clerk_1');

    expect(result).toBe('failed');
    expect(state.steps).toEqual(['document:doc-1', 'document:doc-2', 'user-delete']);
  });
});
