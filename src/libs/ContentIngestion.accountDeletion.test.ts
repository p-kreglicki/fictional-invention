import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  documentRows: [{ id: 'doc-1', userId: 'user-1' }] as Array<{ id: string; userId: string }>,
  chunkRows: [{ pineconeId: 'doc-1_chunk_0' }] as Array<{ pineconeId: string }>,
  throwOnPineconeDelete: false,
  throwOnDbDelete: false,
  steps: [] as string[],
};

const mockDeleteMany = vi.fn(async (_ids: string[]) => {
  state.steps.push('pinecone-delete');
  if (state.throwOnPineconeDelete) {
    throw new Error('Pinecone unavailable');
  }
});

vi.mock('./Pinecone', () => ({
  getNamespacedIndex: () => ({
    deleteMany: mockDeleteMany,
  }),
}));

vi.mock('./Logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function createSelectWhere(_selection: unknown) {
  return async () => {
    if (Array.isArray(_selection) || typeof _selection !== 'object' || _selection === null) {
      return [];
    }

    if ('userId' in _selection) {
      return state.documentRows;
    }

    return state.chunkRows;
  };
}

function createMockTransactionClient() {
  return {
    select: vi.fn((selection: unknown) => ({
      from: vi.fn(() => ({
        where: vi.fn(createSelectWhere(selection)),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => {
        state.steps.push('db-delete');
        if (state.throwOnDbDelete) {
          throw new Error('delete failed');
        }
      }),
    })),
  };
}

const mockDb = {
  select: vi.fn((selection: unknown) => ({
    from: vi.fn(() => ({
      where: vi.fn(createSelectWhere(selection)),
    })),
  })),
  transaction: vi.fn(async (callback: (tx: ReturnType<typeof createMockTransactionClient>) => Promise<unknown>) => {
    return callback(createMockTransactionClient());
  }),
};

vi.mock('./DB', () => ({
  db: mockDb,
}));

describe('deleteDocumentForAccountDeletion', () => {
  beforeEach(() => {
    state.documentRows = [{ id: 'doc-1', userId: 'user-1' }];
    state.chunkRows = [{ pineconeId: 'doc-1_chunk_0' }];
    state.throwOnPineconeDelete = false;
    state.throwOnDbDelete = false;
    state.steps = [];
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('leaves the database document intact when Pinecone cleanup fails', async () => {
    state.throwOnPineconeDelete = true;
    const { deleteDocumentForAccountDeletion } = await import('./ContentIngestion');

    const result = await deleteDocumentForAccountDeletion('doc-1', 'user-1');

    expect(result).toBe(false);
    expect(state.steps).toEqual(['pinecone-delete']);
  });

  it('deletes from Pinecone before removing the database row', async () => {
    const { deleteDocumentForAccountDeletion } = await import('./ContentIngestion');

    const result = await deleteDocumentForAccountDeletion('doc-1', 'user-1');

    expect(result).toBe(true);
    expect(state.steps).toEqual(['pinecone-delete', 'db-delete']);
  });

  it('returns false when the database delete fails after Pinecone cleanup', async () => {
    state.throwOnDbDelete = true;
    const { deleteDocumentForAccountDeletion } = await import('./ContentIngestion');

    const result = await deleteDocumentForAccountDeletion('doc-1', 'user-1');

    expect(result).toBe(false);
    expect(state.steps).toEqual(['pinecone-delete', 'db-delete']);
  });
});
