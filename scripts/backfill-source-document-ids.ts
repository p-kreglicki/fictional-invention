/**
 * Backfill historical exercises.source_document_ids values in small batches.
 *
 * Run after deploying migrations:
 * 1. Deploy the schema changes first
 * 2. Run this script once
 * 3. Verify no historical rows remain without source_document_ids
 */

import { config } from 'dotenv';
import { Client } from 'pg';

config({ path: '.env.local' });
config({ path: '.env' });

const BATCH_SIZE = 500;

async function getRemainingCount(client: Client) {
  const result = await client.query<{ count: string }>(`
    SELECT count(*) AS count
    FROM exercises
    WHERE cardinality(source_chunk_ids) > 0
      AND cardinality(source_document_ids) = 0
  `);

  return Number(result.rows[0]?.count ?? 0);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL not configured');
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  let totalUpdated = 0;
  let batchNumber = 0;

  try {
    await client.connect();

    const startingCount = await getRemainingCount(client);
    console.log(`Starting backfill for ${startingCount} exercise rows`);

    while (true) {
      try {
        await client.query('BEGIN');

        const updateResult = await client.query<{ updated_count: string }>(`
          WITH batch AS (
            SELECT id, source_chunk_ids
            FROM exercises
            WHERE cardinality(source_chunk_ids) > 0
              AND cardinality(source_document_ids) = 0
            ORDER BY id
            LIMIT $1
            FOR UPDATE SKIP LOCKED
          ),
          updates AS (
            SELECT
              batch.id,
              COALESCE(
                array_agg(DISTINCT chunks.document_id) FILTER (WHERE chunks.document_id IS NOT NULL),
                '{}'::uuid[]
              ) AS source_document_ids
            FROM batch
            LEFT JOIN chunks ON chunks.id = ANY(batch.source_chunk_ids)
            GROUP BY batch.id
          ),
          applied AS (
            UPDATE exercises
            SET source_document_ids = updates.source_document_ids
            FROM updates
            WHERE exercises.id = updates.id
            RETURNING exercises.id
          )
          SELECT count(*)::text AS updated_count
          FROM applied
        `, [BATCH_SIZE]);

        const updatedCount = Number(updateResult.rows[0]?.updated_count ?? 0);

        await client.query('COMMIT');

        if (updatedCount === 0) {
          break;
        }

        batchNumber += 1;
        totalUpdated += updatedCount;

        const remainingCount = await getRemainingCount(client);
        console.log(
          `Batch ${batchNumber}: updated ${updatedCount} rows (${totalUpdated} total, ${remainingCount} remaining)`,
        );
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    const remainingCount = await getRemainingCount(client);
    console.log(`Backfill complete. Updated ${totalUpdated} rows. Remaining: ${remainingCount}`);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
