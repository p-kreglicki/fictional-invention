import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockDocument = {
  id: string;
  userId: string;
  status: 'uploading' | 'processing' | 'ready' | 'failed';
};

const state = {
  userExists: true,
  documents: [] as MockDocument[],
};

let lock = Promise.resolve();

function nextId() {
  return `doc-${state.documents.length + 1}`;
}

function createMockTransactionClient() {
  return {
    execute: vi.fn(async () => {
      if (!state.userExists) {
        return { rows: [] };
      }
      return { rows: [{ id: 'user-1' }] };
    }),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => [{ count: state.documents.length }]),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((values: { userId: string; status: MockDocument['status'] }) => ({
        returning: vi.fn(async () => {
          const id = nextId();
          state.documents.push({ id, userId: values.userId, status: values.status });
          return [{ id }];
        }),
      })),
    })),
  };
}

const mockDb = {
  transaction: vi.fn(async (callback: (tx: ReturnType<typeof createMockTransactionClient>) => Promise<unknown>) => {
    // Serialize transaction callbacks to simulate FOR UPDATE locking behavior.
    let release: (() => void) | undefined;
    const waitForTurn = lock;
    lock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await waitForTurn;
    try {
      return await callback(createMockTransactionClient());
    } finally {
      release?.();
    }
  }),
};

vi.mock('./DB', () => ({
  db: mockDb,
}));

vi.mock('./Logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('reserveDocumentSlot', () => {
  beforeEach(() => {
    state.userExists = true;
    state.documents = [];
    lock = Promise.resolve();
    vi.clearAllMocks();
  });

  it('reserves one slot and rejects one request under concurrent near-quota uploads', async () => {
    state.documents = Array.from({ length: 49 }, (_, index) => ({
      id: `doc-${index + 1}`,
      userId: 'user-1',
      status: 'ready',
    }));

    const { reserveDocumentSlot } = await import('./ContentIngestion');

    const first = reserveDocumentSlot({
      userId: 'user-1',
      title: 'Doc A',
      contentType: 'text',
    });
    const second = reserveDocumentSlot({
      userId: 'user-1',
      title: 'Doc B',
      contentType: 'text',
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);
    const successful = [firstResult, secondResult].filter(result => result.success);
    const rejected = [firstResult, secondResult].filter(result => !result.success);

    expect(successful).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.errorCode).toBe('QUOTA_EXCEEDED');
    expect(state.documents).toHaveLength(50);
  });

  it('counts failed documents toward quota', async () => {
    state.documents = Array.from({ length: 50 }, (_, index) => ({
      id: `doc-${index + 1}`,
      userId: 'user-1',
      status: index === 0 ? 'failed' : 'ready',
    }));

    const { reserveDocumentSlot } = await import('./ContentIngestion');

    const result = await reserveDocumentSlot({
      userId: 'user-1',
      title: 'Doc C',
      contentType: 'text',
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('QUOTA_EXCEEDED');
    expect(state.documents).toHaveLength(50);
  });
});
