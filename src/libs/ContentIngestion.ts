/**
 * Content ingestion orchestrator for RAG pipeline.
 * Coordinates text chunking, embedding generation, and dual-store persistence.
 */

import type { ChunkMetadata } from './Pinecone';

import type { Chunk } from './TextChunker';
import type { NewChunk, NewDocument } from '@/models/Schema';

import { count, eq, sql } from 'drizzle-orm';
import { chunksSchema, documentsSchema, usersSchema } from '@/models/Schema';
import { db } from './DB';
import { logger } from './Logger';
import { createEmbeddingsBatched } from './Mistral';
import { getNamespacedIndex } from './Pinecone';
import { chunkText } from './TextChunker';
import { countTokensEstimate } from './TokenCounter';

// Processing constraints
const MAX_CHUNKS_PER_DOCUMENT = 50;
const PINECONE_BATCH_SIZE = 100;
const MAX_DOCUMENTS_PER_USER = 50;

export type ContentType = 'pdf' | 'url' | 'text';

export type IngestionInput = {
  documentId: string;
  userId: string;
  title: string;
  contentType: ContentType;
  text: string;
  sourceUrl?: string;
  originalFilename?: string;
};

type IngestionResult = {
  success: boolean;
  documentId?: string;
  chunkCount?: number;
  error?: string;
  errorCode?: 'CHUNK_LIMIT_EXCEEDED' | 'EMBEDDING_FAILED' | 'STORAGE_FAILED' | 'EMPTY_CONTENT';
};

type ReserveDocumentInput = {
  userId: string;
  title: string;
  contentType: ContentType;
  sourceUrl?: string;
  originalFilename?: string;
};

type ReserveDocumentResult = {
  success: boolean;
  documentId?: string;
  error?: string;
  errorCode?: 'QUOTA_EXCEEDED' | 'USER_NOT_FOUND' | 'STORAGE_FAILED';
};

/**
 * Generates deterministic Pinecone ID for a chunk.
 * Format: {documentId}_chunk_{position}
 * @param documentId - The document UUID
 * @param position - The chunk position (0-indexed)
 */
function generatePineconeId(documentId: string, position: number): string {
  return `${documentId}_chunk_${position}`;
}

/**
 * Updates document status in the database.
 * @param documentId - The document UUID
 * @param status - New status
 * @param errorMessage - Optional error message for failed status
 */
async function updateDocumentStatus(
  documentId: string,
  status: 'uploading' | 'processing' | 'ready' | 'failed',
  errorMessage?: string,
): Promise<void> {
  const updates: Record<string, unknown> = { status };

  if (status === 'ready') {
    updates.processedAt = new Date();
  }

  if (status === 'failed' && errorMessage) {
    updates.errorMessage = errorMessage;
  }

  await db.update(documentsSchema)
    .set(updates)
    .where(eq(documentsSchema.id, documentId));
}

/**
 * Reserves a document slot atomically under a user-level row lock.
 * Prevents quota races under concurrent uploads.
 * @param input - Reservation parameters
 * @returns Reservation result with reserved document ID or quota error
 */
export async function reserveDocumentSlot(input: ReserveDocumentInput): Promise<ReserveDocumentResult> {
  try {
    return await db.transaction(async (tx) => {
      logger.info('quota_check_started', { userId: input.userId });

      const lockResult = await tx.execute(
        sql`SELECT ${usersSchema.id} FROM ${usersSchema} WHERE ${usersSchema.id} = ${input.userId} FOR UPDATE`,
      );

      if (lockResult.rows.length === 0) {
        return {
          success: false,
          error: 'User not found',
          errorCode: 'USER_NOT_FOUND',
        };
      }

      const [quotaResult] = await tx
        .select({ count: count() })
        .from(documentsSchema)
        .where(eq(documentsSchema.userId, input.userId));

      const currentCount = quotaResult?.count ?? 0;
      if (currentCount >= MAX_DOCUMENTS_PER_USER) {
        logger.info('quota_rejected', { userId: input.userId, currentCount, max: MAX_DOCUMENTS_PER_USER });
        return {
          success: false,
          error: `You've reached the ${MAX_DOCUMENTS_PER_USER} document limit. Delete some documents to upload more.`,
          errorCode: 'QUOTA_EXCEEDED',
        };
      }

      const documentData: NewDocument = {
        userId: input.userId,
        title: input.title,
        contentType: input.contentType,
        sourceUrl: input.sourceUrl,
        originalFilename: input.originalFilename,
        status: 'uploading',
        chunkCount: 0,
      };

      const [document] = await tx
        .insert(documentsSchema)
        .values(documentData)
        .returning({ id: documentsSchema.id });

      logger.info('quota_reserved', {
        userId: input.userId,
        documentId: document?.id,
        currentCount,
        max: MAX_DOCUMENTS_PER_USER,
      });

      return {
        success: true,
        documentId: document?.id,
      };
    });
  } catch (error) {
    logger.error('Document slot reservation failed', { userId: input.userId, error });
    return {
      success: false,
      error: 'Failed to reserve document slot.',
      errorCode: 'STORAGE_FAILED',
    };
  }
}

/**
 * Marks a reserved document as failed with a user-facing message.
 * @param documentId - Reserved document UUID
 * @param errorMessage - Failure reason
 */
export async function markDocumentAsFailed(documentId: string, errorMessage: string): Promise<void> {
  await updateDocumentStatus(documentId, 'failed', errorMessage);
}

/**
 * Stores chunks in PostgreSQL.
 * @param documentId - The document UUID
 * @param chunks - Array of text chunks
 * @returns Array of created chunk records with IDs
 */
async function storeChunksInDatabase(
  documentId: string,
  chunks: Chunk[],
): Promise<{ id: string; pineconeId: string; position: number }[]> {
  const chunkRecords: NewChunk[] = chunks.map(chunk => ({
    documentId,
    content: chunk.text,
    position: chunk.position,
    tokenCount: countTokensEstimate(chunk.text),
    pineconeId: generatePineconeId(documentId, chunk.position),
  }));

  const result = await db.insert(chunksSchema).values(chunkRecords).returning({
    id: chunksSchema.id,
    pineconeId: chunksSchema.pineconeId,
    position: chunksSchema.position,
  });

  return result;
}

/**
 * Upserts vectors to Pinecone in batches.
 * @param vectors - Array of vectors with metadata
 */
async function upsertToPinecone(
  vectors: Array<{
    id: string;
    values: number[];
    metadata: ChunkMetadata;
  }>,
): Promise<void> {
  const index = getNamespacedIndex();

  // Batch upserts (Pinecone recommends 100 vectors per request)
  for (let i = 0; i < vectors.length; i += PINECONE_BATCH_SIZE) {
    const batch = vectors.slice(i, i + PINECONE_BATCH_SIZE);
    await index.upsert({ records: batch });
    logger.debug('Upserted batch to Pinecone', { count: batch.length, offset: i });
  }
}

/**
 * Ingests text content into the RAG pipeline.
 * Creates document record, chunks text, generates embeddings, and stores in both stores.
 * @param input - Ingestion parameters
 * @param onProgress - Optional progress callback
 * @returns Ingestion result with document ID or error
 */
export async function ingestContent(
  input: IngestionInput,
  onProgress?: (stage: string, detail?: string) => void,
): Promise<IngestionResult> {
  const documentId = input.documentId;

  try {
    onProgress?.('chunking', 'Splitting text into chunks');

    // Step 1: Chunk the text
    const chunks = chunkText(input.text);

    if (chunks.length === 0) {
      await updateDocumentStatus(documentId, 'failed', 'No content to process after text extraction.');
      return {
        success: false,
        documentId,
        error: 'No content to process after text extraction.',
        errorCode: 'EMPTY_CONTENT',
      };
    }

    // Enforce chunk limit
    if (chunks.length > MAX_CHUNKS_PER_DOCUMENT) {
      await updateDocumentStatus(
        documentId,
        'failed',
        `Document exceeds ${MAX_CHUNKS_PER_DOCUMENT} chunk limit (${chunks.length} chunks). Please use a smaller document.`,
      );
      return {
        success: false,
        documentId,
        error: `Document exceeds ${MAX_CHUNKS_PER_DOCUMENT} chunk limit (${chunks.length} chunks). Please use a smaller document.`,
        errorCode: 'CHUNK_LIMIT_EXCEEDED',
      };
    }

    logger.info('Text chunked', { chunkCount: chunks.length });

    // Step 2: Update reserved document and mark processing
    onProgress?.('creating', 'Updating reserved document record');

    await db.update(documentsSchema)
      .set({
        title: input.title,
        contentType: input.contentType,
        sourceUrl: input.sourceUrl,
        originalFilename: input.originalFilename,
        status: 'processing',
        chunkCount: chunks.length,
        errorMessage: null,
        processedAt: null,
      })
      .where(eq(documentsSchema.id, documentId));

    logger.info('Reserved document updated', { documentId, chunkCount: chunks.length });

    // Step 3: Generate embeddings (with rate limiting)
    onProgress?.('embedding', `Generating embeddings for ${chunks.length} chunks`);

    let embeddings: number[][];
    try {
      embeddings = await createEmbeddingsBatched(
        chunks.map(c => c.text),
        (completed, total) => {
          onProgress?.('embedding', `Embedded ${completed}/${total} chunks`);
        },
      );
    } catch (error) {
      logger.error('Embedding generation failed', { documentId, error });
      await updateDocumentStatus(documentId, 'failed', 'Failed to generate embeddings. Please try again later.');
      return {
        success: false,
        documentId,
        error: 'Failed to generate embeddings.',
        errorCode: 'EMBEDDING_FAILED',
      };
    }

    logger.info('Embeddings generated', { documentId, count: embeddings.length });

    // Step 4: Store chunks in PostgreSQL
    onProgress?.('storing', 'Storing chunks in database');

    let storedChunks: { id: string; pineconeId: string; position: number }[];
    try {
      storedChunks = await storeChunksInDatabase(documentId, chunks);
    } catch (error) {
      logger.error('Database storage failed', { documentId, error });
      await updateDocumentStatus(documentId, 'failed', 'Failed to store content. Please try again.');
      return {
        success: false,
        documentId,
        error: 'Failed to store chunks in database.',
        errorCode: 'STORAGE_FAILED',
      };
    }

    logger.info('Chunks stored in database', { documentId, count: storedChunks.length });

    // Step 5: Upsert vectors to Pinecone
    onProgress?.('indexing', 'Indexing vectors for search');

    const vectors = storedChunks.map((chunk, index) => ({
      id: chunk.pineconeId,
      values: embeddings[index]!,
      metadata: {
        user_id: input.userId,
        document_id: documentId,
        chunk_position: chunk.position,
        content_type: input.contentType,
        created_at: new Date().toISOString(),
        text: chunks[index]!.text,
      } satisfies ChunkMetadata,
    }));

    try {
      await upsertToPinecone(vectors);
    } catch (error) {
      logger.error('Pinecone upsert failed', { documentId, error });
      // Don't fail the entire operation - chunks are in DB, just not searchable
      // Update status to ready but log the issue
      logger.warn('Document stored but vector indexing failed', { documentId });
    }

    logger.info('Vectors upserted to Pinecone', { documentId, count: vectors.length });

    // Step 6: Update document status to ready
    await updateDocumentStatus(documentId, 'ready');

    onProgress?.('complete', 'Content processed successfully');

    return {
      success: true,
      documentId,
      chunkCount: chunks.length,
    };
  } catch (error) {
    logger.error('Content ingestion failed', { documentId, error });

    await updateDocumentStatus(
      documentId,
      'failed',
      'An unexpected error occurred during processing.',
    );

    return {
      success: false,
      documentId,
      error: 'An unexpected error occurred during content processing.',
      errorCode: 'STORAGE_FAILED',
    };
  }
}

/**
 * Deletes a document and its associated chunks from both stores.
 * @param documentId - The document UUID to delete
 * @param userId - The user ID (for authorization verification)
 * @returns True if deleted successfully
 */
export async function deleteDocument(documentId: string, userId: string): Promise<boolean> {
  try {
    // Verify ownership
    const [document] = await db.select({ id: documentsSchema.id, userId: documentsSchema.userId })
      .from(documentsSchema)
      .where(eq(documentsSchema.id, documentId));

    if (!document || document.userId !== userId) {
      return false;
    }

    // Get chunk Pinecone IDs before deletion
    const chunks = await db.select({ pineconeId: chunksSchema.pineconeId })
      .from(chunksSchema)
      .where(eq(chunksSchema.documentId, documentId));

    // Delete from Pinecone
    if (chunks.length > 0) {
      const index = getNamespacedIndex();
      const pineconeIds = chunks.map(c => c.pineconeId);
      await index.deleteMany(pineconeIds);
      logger.info('Deleted vectors from Pinecone', { documentId, count: pineconeIds.length });
    }

    // Delete document (chunks cascade automatically)
    await db.delete(documentsSchema).where(eq(documentsSchema.id, documentId));

    logger.info('Document deleted', { documentId });
    return true;
  } catch (error) {
    logger.error('Document deletion failed', { documentId, error });
    return false;
  }
}
