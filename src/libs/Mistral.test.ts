import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

const embeddingsCreateMock = vi.fn();
const loggerDebugMock = vi.fn();
const loggerErrorMock = vi.fn();
const loggerWarnMock = vi.fn();

function resetMistralGlobal() {
  delete (globalThis as { mistral?: unknown }).mistral;
}

function applyRequiredEnv() {
  process.env = { ...originalEnv };
  Object.assign(process.env, {
    CLERK_SECRET_KEY: 'sk_test',
    DATABASE_URL: 'postgres://localhost:5432/test',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test',
    MISTRAL_API_KEY: 'mistral_test_key',
    NODE_ENV: 'test',
  });
}

function mockDependencies() {
  vi.doMock('./Logger', () => ({
    logger: {
      debug: loggerDebugMock,
      error: loggerErrorMock,
      warn: loggerWarnMock,
    },
  }));

  vi.doMock('@mistralai/mistralai', () => ({
    Mistral: class {
      embeddings = {
        create: embeddingsCreateMock,
      };
    },
  }));
}

function buildEmbeddingResponse(inputCount: number) {
  return {
    data: Array.from({ length: inputCount }, (_, index) => ({
      embedding: [index + 1],
    })),
    usage: {
      promptTokens: inputCount,
      totalTokens: inputCount,
    },
  };
}

function buildTexts(count: number) {
  return Array.from({ length: count }, (_, index) => `text-${index}`);
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

async function loadMistralModule(delayMs?: string) {
  applyRequiredEnv();

  if (delayMs === undefined) {
    delete process.env.MISTRAL_EMBEDDING_BATCH_DELAY_MS;
  } else {
    process.env.MISTRAL_EMBEDDING_BATCH_DELAY_MS = delayMs;
  }

  embeddingsCreateMock.mockImplementation(async ({ inputs }: { inputs: string[] }) => {
    return buildEmbeddingResponse(inputs.length);
  });

  vi.resetModules();
  resetMistralGlobal();
  mockDependencies();

  return import('./Mistral');
}

describe('Mistral', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    applyRequiredEnv();
    resetMistralGlobal();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.doUnmock('./Logger');
    vi.doUnmock('@mistralai/mistralai');
    resetMistralGlobal();
  });

  it('returns embeddings without waiting when delay is unset', async () => {
    const { createEmbeddingsBatched } = await loadMistralModule();

    const result = await createEmbeddingsBatched(buildTexts(17));

    expect(result).toHaveLength(17);
    expect(embeddingsCreateMock).toHaveBeenCalledTimes(2);
    expect(loggerDebugMock).not.toHaveBeenCalled();
  });

  it('returns embeddings without waiting when delay is 0', async () => {
    const { createEmbeddingsBatched } = await loadMistralModule('0');

    const result = await createEmbeddingsBatched(buildTexts(17));

    expect(result).toHaveLength(17);
    expect(embeddingsCreateMock).toHaveBeenCalledTimes(2);
    expect(loggerDebugMock).not.toHaveBeenCalled();
  });

  it('waits between batches when delay is configured', async () => {
    vi.useFakeTimers();
    const { createEmbeddingsBatched } = await loadMistralModule('50');

    let resolved = false;
    const resultPromise = createEmbeddingsBatched(buildTexts(17)).then((result) => {
      resolved = true;
      return result;
    });

    await flushAsyncWork();

    expect(resolved).toBe(false);
    expect(loggerDebugMock).toHaveBeenCalledTimes(1);
    expect(loggerDebugMock).toHaveBeenCalledWith('Embedding batch throttling enabled', { batchDelayMs: 50 });

    await vi.advanceTimersByTimeAsync(49);

    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const result = await resultPromise;

    expect(resolved).toBe(true);
    expect(result).toHaveLength(17);
    expect(embeddingsCreateMock).toHaveBeenCalledTimes(2);
  });

  it('skips wait after the final batch', async () => {
    vi.useFakeTimers();
    const { createEmbeddingsBatched } = await loadMistralModule('25');

    const resultPromise = createEmbeddingsBatched(buildTexts(33));

    await flushAsyncWork();

    expect(loggerDebugMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(25);

    expect(loggerDebugMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(25);
    const result = await resultPromise;

    expect(result).toHaveLength(33);
    expect(embeddingsCreateMock).toHaveBeenCalledTimes(3);
    expect(loggerDebugMock).toHaveBeenCalledTimes(2);
  });

  it('preserves progress callbacks across batches', async () => {
    const { createEmbeddingsBatched } = await loadMistralModule();
    const onProgress = vi.fn();

    await createEmbeddingsBatched(buildTexts(33), onProgress);

    expect(onProgress).toHaveBeenNthCalledWith(1, 16, 33);
    expect(onProgress).toHaveBeenNthCalledWith(2, 32, 33);
    expect(onProgress).toHaveBeenNthCalledWith(3, 33, 33);
  });
});
