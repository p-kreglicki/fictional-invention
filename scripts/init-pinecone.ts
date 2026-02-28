/**
 * Initialize Pinecone Index
 *
 * Run with: npm run pinecone:init
 *
 * Creates the Pinecone index if it doesn't exist.
 * Requires PINECONE_API_KEY to be set in .env.local
 */

import 'dotenv/config';

async function main() {
  console.log('Initializing Pinecone index...\n');

  if (!process.env.PINECONE_API_KEY || process.env.PINECONE_API_KEY === 'YOUR_PINECONE_API_KEY') {
    console.error('Error: PINECONE_API_KEY not configured in .env.local');
    process.exit(1);
  }

  const { ensureIndexExists, PINECONE_INDEX_NAME } = await import('../src/libs/Pinecone');

  try {
    await ensureIndexExists();
    console.log(`✓ Pinecone index '${PINECONE_INDEX_NAME}' is ready`);
  } catch (err) {
    console.error('✗ Failed to initialize Pinecone index:', err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Initialization failed:', err);
  process.exit(1);
});
