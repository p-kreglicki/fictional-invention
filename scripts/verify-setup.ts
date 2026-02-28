/**
 * Phase 1 Setup Verification Script
 *
 * Run with: npm run verify:setup
 *
 * Tests:
 * 1. Database connection
 * 2. Pinecone connection (if API key configured)
 * 3. Mistral embeddings (if API key configured)
 */

import 'dotenv/config';

async function main() {
  console.log('=== Phase 1 Setup Verification ===\n');

  // Test 1: Database connection
  console.log('1. Testing database connection...');
  try {
    // Dynamic import to avoid issues with env loading
    const { db } = await import('../src/libs/DB');
    const { usersSchema } = await import('../src/models/Schema');

    await db.select().from(usersSchema).limit(1);
    console.log('   ✓ Database connected\n');
  } catch (err) {
    console.error('   ✗ Database connection failed:', err);
    process.exit(1);
  }

  // Test 2: Pinecone connection (optional)
  console.log('2. Testing Pinecone connection...');
  if (!process.env.PINECONE_API_KEY || process.env.PINECONE_API_KEY === 'YOUR_PINECONE_API_KEY') {
    console.log('   ⚠ PINECONE_API_KEY not configured, skipping\n');
  } else {
    try {
      const { pinecone, ensureIndexExists, PINECONE_INDEX_NAME } = await import('../src/libs/Pinecone');

      if (!pinecone) {
        throw new Error('Pinecone client not initialized');
      }

      await ensureIndexExists();
      const indexes = await pinecone.listIndexes();
      const ourIndex = indexes.indexes?.find(idx => idx.name === PINECONE_INDEX_NAME);

      if (ourIndex) {
        console.log(`   ✓ Pinecone index '${PINECONE_INDEX_NAME}' exists`);
        console.log(`   Dimension: ${ourIndex.dimension}, Status: ${ourIndex.status?.state}\n`);
      } else {
        throw new Error('Index not found');
      }
    } catch (err) {
      console.error('   ✗ Pinecone connection failed:', err);
      process.exit(1);
    }
  }

  // Test 3: Mistral embeddings (optional)
  console.log('3. Testing Mistral embeddings...');
  if (!process.env.MISTRAL_API_KEY || process.env.MISTRAL_API_KEY === 'YOUR_MISTRAL_API_KEY') {
    console.log('   ⚠ MISTRAL_API_KEY not configured, skipping\n');
  } else {
    try {
      const { createEmbeddings, MISTRAL_EMBED_DIMENSION } = await import('../src/libs/Mistral');

      const result = await createEmbeddings(['Ciao, come stai?']);

      if (result.embeddings[0]!.length === MISTRAL_EMBED_DIMENSION) {
        console.log(`   ✓ Mistral embeddings working (dimension: ${MISTRAL_EMBED_DIMENSION})`);
        console.log(`   Tokens used: ${result.usage.totalTokens}\n`);
      } else {
        throw new Error(`Wrong dimension: ${result.embeddings[0]!.length}`);
      }
    } catch (err) {
      console.error('   ✗ Mistral embedding failed:', err);
      process.exit(1);
    }
  }

  console.log('=== Verification Complete ===');
  console.log('\nNote: Configure API keys in .env.local to test Pinecone and Mistral.');
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
