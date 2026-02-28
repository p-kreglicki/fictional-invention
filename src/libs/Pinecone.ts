import type { RecordMetadata } from '@pinecone-database/pinecone';
import { Pinecone } from '@pinecone-database/pinecone';
import { Env } from './Env';
import { logger } from './Logger';

// Singleton client
const globalForPinecone = globalThis as unknown as {
  pinecone: Pinecone | undefined;
};

function createPineconeClient(): Pinecone | null {
  if (!Env.PINECONE_API_KEY) {
    logger.warn('PINECONE_API_KEY not configured, Pinecone client unavailable');
    return null;
  }
  return new Pinecone({ apiKey: Env.PINECONE_API_KEY });
}

export const pinecone = globalForPinecone.pinecone ?? createPineconeClient();

if (Env.NODE_ENV !== 'production' && pinecone) {
  globalForPinecone.pinecone = pinecone;
}

// Constants
export const PINECONE_INDEX_NAME = 'italian-learning';
export const PINECONE_NAMESPACE = 'content';
export const MISTRAL_EMBED_DIMENSION = 1024;

// Metadata type for vectors
export type ChunkMetadata = {
  user_id: string;
  document_id: string;
  chunk_position: number;
  content_type: 'pdf' | 'url' | 'text';
  created_at: string;
  text: string;
} & RecordMetadata;

// Get typed index
export function getIndex() {
  if (!pinecone) {
    throw new Error('Pinecone client not initialized. Check PINECONE_API_KEY.');
  }
  return pinecone.index<ChunkMetadata>(PINECONE_INDEX_NAME);
}

// Get namespaced index
export function getNamespacedIndex() {
  return getIndex().namespace(PINECONE_NAMESPACE);
}

// Create index if it doesn't exist
export async function ensureIndexExists(): Promise<void> {
  if (!pinecone) {
    throw new Error('Pinecone client not initialized. Check PINECONE_API_KEY.');
  }

  const indexes = await pinecone.listIndexes();
  const indexExists = indexes.indexes?.some(idx => idx.name === PINECONE_INDEX_NAME);

  if (!indexExists) {
    logger.info('Creating Pinecone index', { name: PINECONE_INDEX_NAME });
    await pinecone.createIndex({
      name: PINECONE_INDEX_NAME,
      dimension: MISTRAL_EMBED_DIMENSION,
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1', // Required for free tier
        },
      },
      waitUntilReady: true,
    });
    logger.info('Created Pinecone index', { name: PINECONE_INDEX_NAME });
  }
}

// Keep index alive (run weekly to prevent 3-week inactivity pause on free tier)
export async function keepAlive(): Promise<void> {
  const index = getIndex();
  await index.query({
    vector: Array.from({ length: MISTRAL_EMBED_DIMENSION }).fill(0) as number[],
    topK: 1,
  });
  logger.info('Pinecone keep-alive ping sent');
}
