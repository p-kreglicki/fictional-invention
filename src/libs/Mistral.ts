import type * as z from 'zod';

import { Mistral } from '@mistralai/mistralai';
import {
  HTTPValidationError,
  SDKValidationError,
} from '@mistralai/mistralai/models/errors';
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL } from './EmbeddingConfig';
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
const MAX_BATCH_SIZE = 16;
const CHAT_MODEL = 'mistral-small-latest';

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Types
export type EmbeddingResult = {
  embeddings: number[][];
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
};

type StructuredChatInput<T extends z.ZodTypeAny> = {
  systemPrompt: string;
  userPrompt: string;
  responseFormat: T;
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

type StructuredChatResult<T extends z.ZodTypeAny> = {
  parsed: z.infer<T>;
  rawContent: string | null;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
};

type JsonChatInput = {
  systemPrompt: string;
  userPrompt: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
};

function extractTextContent(content: unknown): string | null {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const textParts = content
    .map((part) => {
      if (
        typeof part === 'object'
        && part
        && 'text' in part
        && typeof part.text === 'string'
      ) {
        return part.text;
      }
      return '';
    })
    .filter(Boolean);

  if (textParts.length === 0) {
    return null;
  }

  return textParts.join('\n');
}

/**
 * Create embeddings for an array of texts.
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
      model: EMBEDDING_MODEL,
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
 * Creates structured chat completion parsed by a Zod schema.
 * @param input - Chat prompts and expected schema.
 * @returns Parsed result and token usage.
 */
export async function createStructuredChatCompletion<T extends z.ZodTypeAny>(
  input: StructuredChatInput<T>,
): Promise<StructuredChatResult<T>> {
  if (!mistral) {
    throw new Error('Mistral client not initialized. Check MISTRAL_API_KEY.');
  }

  const response = await mistral.chat.parse({
    model: input.model ?? CHAT_MODEL,
    temperature: input.temperature ?? 0.2,
    maxTokens: input.maxTokens ?? 1200,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userPrompt },
    ],
    responseFormat: input.responseFormat,
  });

  const choice = response.choices?.[0];
  const parsed = choice?.message?.parsed;
  if (!parsed) {
    throw new Error('Mistral structured output parsing failed');
  }

  return {
    parsed: parsed as z.infer<T>,
    rawContent: extractTextContent(choice?.message?.content),
    usage: {
      promptTokens: response.usage?.promptTokens ?? 0,
      totalTokens: response.usage?.totalTokens ?? 0,
    },
  };
}

/**
 * Creates chat completion in JSON mode.
 * @param input - Chat prompts and generation options.
 * @returns Raw JSON message content.
 */
export async function createJsonChatCompletion(input: JsonChatInput): Promise<string> {
  if (!mistral) {
    throw new Error('Mistral client not initialized. Check MISTRAL_API_KEY.');
  }

  const response = await mistral.chat.complete({
    model: input.model ?? CHAT_MODEL,
    temperature: input.temperature ?? 0.2,
    maxTokens: input.maxTokens ?? 1200,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.userPrompt },
    ],
    responseFormat: { type: 'json_object' },
  });

  const choice = response.choices?.[0];
  const content = extractTextContent(choice?.message?.content);

  if (!content) {
    throw new Error('Mistral JSON mode returned empty content');
  }

  return content;
}

/**
 * Create embeddings for large datasets in multiple batches.
 * Optional inter-batch throttling is controlled via environment config.
 * @param texts - Array of text strings to embed
 * @param onProgress - Optional callback for progress updates
 */
export async function createEmbeddingsBatched(
  texts: string[],
  onProgress?: (completed: number, total: number) => void,
): Promise<number[][]> {
  const allEmbeddings: number[][] = [];
  const batchDelayMs = Env.MISTRAL_EMBEDDING_BATCH_DELAY_MS ?? 0;

  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);
    const result = await createEmbeddings(batch);
    allEmbeddings.push(...result.embeddings);

    onProgress?.(Math.min(i + MAX_BATCH_SIZE, texts.length), texts.length);

    const hasMoreBatches = i + MAX_BATCH_SIZE < texts.length;
    if (hasMoreBatches && batchDelayMs > 0) {
      logger.debug('Embedding batch throttling enabled', { batchDelayMs });
      await wait(batchDelayMs);
    }
  }

  return allEmbeddings;
}

// Verify API connection
export async function verifyConnection(): Promise<boolean> {
  try {
    const result = await createEmbeddings(['test']);
    return result.embeddings.length === 1 && result.embeddings[0]!.length === EMBEDDING_DIMENSION;
  } catch {
    return false;
  }
}
