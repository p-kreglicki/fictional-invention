import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  documentRow: [{ id: 'doc-1', userId: 'user-1' }] as Array<{ id: string; userId: string }>,
  chunkRows: [{ pineconeId: 'doc-1_chunk_0' }] as Array<{ pineconeId: string }>,
  throwOnPineconeDelete: false,
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

function createMockTransactionClient() {
  return {
    select: vi.fn((_selection: unknown) => ({
      from: vi.fn((_table: unknown) => ({
        where: vi.fn(async () => {
          if (Array.isArray(_selection) || typeof _selection !== 'object' || _selection === null) {
            return [];
          }

          if ('userId' in _selection) {
            return state.documentRow;
          }

          return state.chunkRows;
        }),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => {
        state.steps.push('db-delete');
      }),
    })),
  };
}

const mockDb = {
  transaction: vi.fn(async (callback: (tx: ReturnType<typeof createMockTransactionClient>) => Promise<unknown>) => {
    return callback(createMockTransactionClient());
  }),
};

vi.mock('./DB', () => ({
  db: mockDb,
}));

describe('deleteDocument', () => {
  beforeEach(() => {
    state.documentRow = [{ id: 'doc-1', userId: 'user-1' }];
    state.chunkRows = [{ pineconeId: 'doc-1_chunk_0' }];
    state.throwOnPineconeDelete = false;
    state.steps = [];
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns false when document ownership does not match', async () => {
    state.documentRow = [{ id: 'doc-1', userId: 'user-2' }];
    const { deleteDocument } = await import('./ContentIngestion');

    const result = await deleteDocument('doc-1', 'user-1');

    expect(result).toBe(false);
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it('deletes from PostgreSQL before Pinecone cleanup', async () => {
    const { deleteDocument } = await import('./ContentIngestion');

    const result = await deleteDocument('doc-1', 'user-1');

    expect(result).toBe(true);
    expect(state.steps).toEqual(['db-delete', 'pinecone-delete']);
  });

  it('returns true when Pinecone cleanup fails after database deletion', async () => {
    state.throwOnPineconeDelete = true;
    const { deleteDocument } = await import('./ContentIngestion');

    const result = await deleteDocument('doc-1', 'user-1');

    expect(result).toBe(true);
    expect(state.steps).toEqual(['db-delete', 'pinecone-delete']);
  });
});
