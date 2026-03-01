/**
 * Sync Clerk Users to Database
 *
 * Run with: npm run sync:users
 *
 * Syncs all existing Clerk users to the local database.
 * Useful for:
 * - Initial setup when webhook wasn't configured yet
 * - Recovery after webhook failures
 * - Development/testing
 */

import { config } from 'dotenv';
import { createClerkClient } from '@clerk/backend';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';

// Load environment
config({ path: '.env.local' });
config({ path: '.env' });

// Import schema after env is loaded
import { usersSchema } from '../src/models/Schema';

async function main() {
  console.log('=== Syncing Clerk Users to Database ===\n');

  // Validate environment
  if (!process.env.CLERK_SECRET_KEY) {
    console.error('Error: CLERK_SECRET_KEY not configured');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL not configured');
    process.exit(1);
  }

  // Initialize Clerk client
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

  // Initialize database
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema: { usersSchema } });

  try {
    // Fetch all users from Clerk (paginated)
    console.log('Fetching users from Clerk...');
    let allUsers: { id: string; createdAt: number }[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const response = await clerk.users.getUserList({ limit, offset });
      allUsers = allUsers.concat(response.data.map(u => ({ id: u.id, createdAt: u.createdAt })));

      if (response.data.length < limit) break;
      offset += limit;
    }

    console.log(`Found ${allUsers.length} users in Clerk\n`);

    if (allUsers.length === 0) {
      console.log('No users to sync.');
      return;
    }

    // Sync each user
    let created = 0;
    let skipped = 0;

    for (const clerkUser of allUsers) {
      // Check if user already exists
      const existing = await db
        .select()
        .from(usersSchema)
        .where(eq(usersSchema.clerkId, clerkUser.id))
        .limit(1);

      if (existing.length > 0) {
        console.log(`  ⏭ User ${clerkUser.id} already exists, skipping`);
        skipped++;
        continue;
      }

      // Create user
      await db.insert(usersSchema).values({
        clerkId: clerkUser.id,
      });
      console.log(`  ✓ Created user ${clerkUser.id}`);
      created++;
    }

    console.log('\n=== Sync Complete ===');
    console.log(`Created: ${created}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Total: ${allUsers.length}`);

  } catch (err) {
    console.error('Sync failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
