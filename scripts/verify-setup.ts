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

import { config } from 'dotenv';
import { Pinecone } from '@pinecone-database/pinecone';
import { Mistral } from '@mistralai/mistralai';

// Load .env.local first (higher priority), then .env
config({ path: '.env.local' });
config({ path: '.env' });

const PINECONE_INDEX_NAME = 'italian-learning';
const MISTRAL_EMBED_DIMENSION = 1024;

async function main() {
  console.log('=== Phase 1 Setup Verification ===\n');

  // Test 1: Database connection
  console.log('1. Testing database connection...');
  try {
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
      const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
      const indexes = await pinecone.listIndexes();
      const ourIndex = indexes.indexes?.find(idx => idx.name === PINECONE_INDEX_NAME);

      if (ourIndex) {
        console.log(`   ✓ Pinecone index '${PINECONE_INDEX_NAME}' exists`);
        console.log(`   Dimension: ${ourIndex.dimension}, Status: ${ourIndex.status?.state}\n`);
      } else {
        // Create the index if it doesn't exist
        console.log(`   Creating index '${PINECONE_INDEX_NAME}'...`);
        await pinecone.createIndex({
          name: PINECONE_INDEX_NAME,
          dimension: MISTRAL_EMBED_DIMENSION,
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1',
            },
          },
          waitUntilReady: true,
        });
        console.log(`   ✓ Pinecone index '${PINECONE_INDEX_NAME}' created\n`);
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
      const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
      const result = await mistral.embeddings.create({
        model: 'mistral-embed',
        inputs: ['Ciao, come stai?'],
      });

      const embedding = result.data[0]?.embedding as number[];
      if (embedding.length === MISTRAL_EMBED_DIMENSION) {
        console.log(`   ✓ Mistral embeddings working (dimension: ${MISTRAL_EMBED_DIMENSION})`);
        console.log(`   Tokens used: ${result.usage.totalTokens}\n`);
      } else {
        throw new Error(`Wrong dimension: ${embedding.length}`);
      }
    } catch (err) {
      console.error('   ✗ Mistral embedding failed:', err);
      process.exit(1);
    }
  }

  console.log('=== All Checks Passed! ===');
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
