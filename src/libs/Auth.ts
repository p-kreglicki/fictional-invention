import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { usersSchema } from '@/models/Schema';

/**
 * Get the current authenticated user from the database.
 * Returns null if not authenticated or user not found.
 */
export async function getCurrentUser() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const user = await db.query.usersSchema.findFirst({
    where: eq(usersSchema.clerkId, userId),
  });

  return user;
}

/**
 * Get the current authenticated user, throwing if not found.
 * Use in protected routes where auth is guaranteed.
 */
export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error('User not found in database. Webhook may not have synced yet.');
  }

  return user;
}

/**
 * Get Clerk user ID without database lookup.
 * Useful for simple auth checks.
 */
export async function getClerkUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

/**
 * Ensure user is authenticated, throw if not.
 */
export async function requireAuth(): Promise<string> {
  const userId = await getClerkUserId();

  if (!userId) {
    throw new Error('Authentication required');
  }

  return userId;
}
