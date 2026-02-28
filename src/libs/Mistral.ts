import { Mistral } from '@mistralai/mistralai';
import {
  HTTPValidationError,
  SDKValidationError,
} from '@mistralai/mistralai/models/errors';
import { Env } from './Env';
import { logger } from './Logger';

// Singleton client with retry configuration
const globalForMistral = globalThis as unknown as {
  mistral: Mistral | undefined;
};

function createMistralClient(): Mistral | null {
  if (!Env.MISTRAL_API_KEY) {
    logger.warn('MISTRAL_API_KEY not configured, Mistral client unavailable');
    return null;
  }

  return new Mistral({
    apiKey: Env.MISTRAL_API_KEY,
    retryConfig: {
      strategy: 'backoff',
      backoff: {
        initialInterval: 1000,
        maxInterval: 60000,
        exponent: 2,
        maxElapsedTime: 300000, // 5 minutes
      },
      retryConnectionErrors: true,
    },
  });
}

export const mistral = globalForMistral.mistral ?? createMistralClient();

if (Env.NODE_ENV !== 'production' && mistral) {
  globalForMistral.mistral = mistral;
}

// Constants
const MISTRAL_EMBED_MODEL = 'mistral-embed';
const MAX_BATCH_SIZE = 16;
export const MISTRAL_EMBED_DIMENSION = 1024;

// Types
export type EmbeddingResult = {
  embeddings: number[][];
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
};

/**
 * Create embeddings for an array of texts.
 * IMPORTANT: Free tier is limited to 2 requests/minute.
 * Batch up to 16 texts per request to maximize throughput.
 * @param texts - Array of text strings to embed (max 16)
 */
export async function createEmbeddings(texts: string[]): Promise<EmbeddingResult> {
  if (!mistral) {
    throw new Error('Mistral client not initialized. Check MISTRAL_API_KEY.');
  }

  if (texts.length > MAX_BATCH_SIZE) {
    throw new Error(`Maximum ${MAX_BATCH_SIZE} texts per request`);
  }

  if (texts.length === 0) {
    throw new Error('At least one text is required');
  }

  try {
    const result = await mistral.embeddings.create({
      model: MISTRAL_EMBED_MODEL,
      inputs: texts,
    });

    return {
      embeddings: result.data.map(item => item.embedding as number[]),
      usage: {
        promptTokens: result.usage.promptTokens ?? 0,
        totalTokens: result.usage.totalTokens ?? 0,
      },
    };
  } catch (err) {
    if (err instanceof SDKValidationError) {
      logger.error('Mistral SDK validation error', { error: err.message });
      throw new Error(`Mistral validation failed: ${err.message}`);
    }

    if (err instanceof HTTPValidationError) {
      logger.error('Mistral HTTP validation error', { error: err.message });
      throw new Error(`Mistral API validation failed: ${err.message}`);
    }

    throw err;
  }
}

/**
 * Create embeddings for large datasets with rate limiting.
 * WARNING: Free tier is 2 req/min - this will be slow for large datasets.
 * @param texts - Array of text strings to embed
 * @param onProgress - Optional callback for progress updates
 */
export async function createEmbeddingsBatched(
  texts: string[],
  onProgress?: (completed: number, total: number) => void,
): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);
    const result = await createEmbeddings(batch);
    allEmbeddings.push(...result.embeddings);

    onProgress?.(Math.min(i + MAX_BATCH_SIZE, texts.length), texts.length);

    // Rate limit: 2 requests/min on free tier = 30s between requests
    if (i + MAX_BATCH_SIZE < texts.length) {
      logger.debug('Rate limiting: waiting 31s before next batch');
      await new Promise(resolve => setTimeout(resolve, 31000));
    }
  }

  return allEmbeddings;
}

// Verify API connection
export async function verifyConnection(): Promise<boolean> {
  try {
    const result = await createEmbeddings(['test']);
    return result.embeddings.length === 1 && result.embeddings[0]!.length === MISTRAL_EMBED_DIMENSION;
  } catch {
    return false;
  }
}
