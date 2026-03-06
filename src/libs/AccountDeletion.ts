import { eq } from 'drizzle-orm';
import { deleteDocumentForAccountDeletion } from '@/libs/ContentIngestion';
import { documentsSchema, usersSchema } from '@/models/Schema';
import { db } from './DB';
import { logger } from './Logger';

type DeleteUserAccountResult = 'deleted' | 'not_found' | 'failed';

/**
 * Deletes a local user account and all owned data in a deterministic order.
 * Documents are removed explicitly to preserve Pinecone cleanup; relational rows
 * are removed through database cascades when the user row is deleted.
 * @param clerkId - Clerk user ID from the webhook payload.
 * @returns Result status describing whether deletion succeeded, was unnecessary, or failed.
 */
export async function deleteUserAccountByClerkId(clerkId: string): Promise<DeleteUserAccountResult> {
  try {
    const existingUser = await db.query.usersSchema.findFirst({
      where: eq(usersSchema.clerkId, clerkId),
    });

    if (!existingUser) {
      return 'not_found';
    }

    const documents = await db
      .select({ id: documentsSchema.id })
      .from(documentsSchema)
      .where(eq(documentsSchema.userId, existingUser.id));

    for (const document of documents) {
      const deleted = await deleteDocumentForAccountDeletion(document.id, existingUser.id);

      if (!deleted) {
        logger.error('User deletion aborted during document cleanup', {
          clerkId,
          userId: existingUser.id,
          documentId: document.id,
        });
        return 'failed';
      }
    }

    const deletedUsers = await db
      .delete(usersSchema)
      .where(eq(usersSchema.id, existingUser.id))
      .returning({ id: usersSchema.id });

    if (deletedUsers.length === 0) {
      logger.error('User deletion failed to remove local user row', {
        clerkId,
        userId: existingUser.id,
      });
      return 'failed';
    }

    logger.info('Deleted user account from Clerk webhook', {
      clerkId,
      userId: existingUser.id,
      documentCount: documents.length,
    });
    return 'deleted';
  } catch (error) {
    logger.error('User account deletion failed', { clerkId, error });
    return 'failed';
  }
}
