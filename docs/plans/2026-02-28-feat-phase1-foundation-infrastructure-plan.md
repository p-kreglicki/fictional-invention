---
title: "feat: Phase 1 Foundation - Infrastructure Setup"
type: feat
date: 2026-02-28
status: ready
parent: docs/plans/2026-02-28-feat-italian-rag-learning-tool-plan.md
---

# Phase 1: Foundation (Infrastructure Setup)

## Overview

Set up the foundation for the Italian RAG Learning Tool with working authentication, database, and external service connections (Pinecone, Mistral).

**Goal:** Running app with auth, database, Pinecone vector store, and Mistral API client.

**Estimated effort:** 1-2 days

---

## Prerequisites

- Node.js 20+ installed
- Clerk account (free)
- Pinecone account (Starter/free tier)
- Mistral account (Experiment tier)

---

## Research Summary

### Key Findings

| Area | Finding | Impact |
|------|---------|--------|
| **Boilerplate** | ixartz already has Drizzle + Clerk configured | Less setup work |
| **Clerk v6** | `authMiddleware()` deprecated, use `clerkMiddleware()` | Middleware already correct in boilerplate |
| **Clerk v6** | `auth()` is now async | All auth calls need `await` |
| **Drizzle** | Schema at `src/models/Schema.ts` | Add tables there |
| **PGlite** | Not in boilerplate, needs addition | Add conditional connection factory |
| **Pinecone** | Free tier: us-east-1 only, 3-week inactivity pause | Need keep-alive job |
| **Mistral** | Free tier: **2 requests/minute** | Must batch aggressively |
| **Mistral embed** | Dimension: **1024** | Index must match |

### Critical Gotchas

1. **Clerk Webhooks**: Must verify with Svix - install `svix` package
2. **Pinecone Region**: Free tier locked to `aws/us-east-1`
3. **Mistral Rate Limits**: Only 2 req/min - batch up to 16 texts per request
4. **PGlite vs PostgreSQL**: Same dialect, same migrations, just different connection

---

## Implementation Tasks

### Task 1: Clone and Configure Boilerplate

**Files created/modified:**
- Project root (new project)
- `.env.local` (create)
- `src/libs/Env.ts` (modify)

```bash
# Clone the boilerplate
npx create-next-app@latest italian-rag-app -e https://github.com/ixartz/Next-js-Boilerplate

cd italian-rag-app
npm install
```

**Create `.env.local`:**
```bash
# Clerk (get from Clerk Dashboard)
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# Pinecone (get from Pinecone Console)
PINECONE_API_KEY=...

# Mistral (get from Mistral Console)
MISTRAL_API_KEY=...

# Local development with PGlite
USE_PGLITE=true
```

**Update `src/libs/Env.ts`** - Add new environment variables:
```typescript
server: {
  // ... existing
  PINECONE_API_KEY: z.string().min(1),
  MISTRAL_API_KEY: z.string().min(1),
  CLERK_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
  USE_PGLITE: z.string().optional(),
},
```

**Acceptance criteria:**
- [x] `npm run dev` starts successfully
- [x] Sign-in/sign-up flow works with Clerk (provided by boilerplate)
- [x] Environment validation passes

---

### Task 2: Add PGlite Support for Local Development

**Files created/modified:**
- `src/utils/DBConnection.ts` (modify)
- `drizzle.config.ts` (modify)

**Install PGlite:**
```bash
npm install @electric-sql/pglite
```

**Modify `src/utils/DBConnection.ts`:**
```typescript
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { Pool } from 'pg';
import { Env } from '@/libs/Env';
import * as schema from '@/models/Schema';

export const createDbConnection = () => {
  const usePglite = process.env.USE_PGLITE === 'true';

  if (usePglite) {
    // Development: Use PGlite (file-based persistence)
    const client = new PGlite('./data/pglite');
    return drizzlePglite({ client, schema });
  }

  // Production: Use real PostgreSQL
  const pool = new Pool({
    connectionString: Env.DATABASE_URL,
    max: Env.DATABASE_URL.includes('localhost') || Env.DATABASE_URL.includes('127.0.0.1')
      ? 1
      : undefined,
  });

  return drizzlePg({ client: pool, schema });
};
```

**Add to `.gitignore`:**
```
# PGlite data
/data/pglite/
```

**Acceptance criteria:**
- [x] App runs with `USE_PGLITE=true` (boilerplate uses pglite-server)
- [x] PGlite data persists in `local.db`
- [x] Same migrations work for both PGlite and PostgreSQL

---

### Task 3: Define Database Schema

**Files created/modified:**
- `src/models/Schema.ts` (modify)

**Add to `src/models/Schema.ts`:**
```typescript
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core';

// Enums
export const documentStatusEnum = pgEnum('document_status', [
  'uploading',
  'processing',
  'ready',
  'failed'
]);

export const contentTypeEnum = pgEnum('content_type', [
  'pdf',
  'url',
  'text'
]);

export const exerciseTypeEnum = pgEnum('exercise_type', [
  'multiple_choice',
  'fill_gap',
  'single_answer'
]);

export const difficultyEnum = pgEnum('difficulty', [
  'beginner',
  'intermediate',
  'advanced'
]);

// Tables
export const usersSchema = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: text('clerk_id').notNull().unique(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const documentsSchema = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => usersSchema.id).notNull(),
  title: text('title').notNull(),
  contentType: contentTypeEnum('content_type').notNull(),
  sourceUrl: text('source_url'),
  originalFilename: text('original_filename'),
  status: documentStatusEnum('status').default('uploading').notNull(),
  chunkCount: integer('chunk_count').default(0),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  processedAt: timestamp('processed_at', { mode: 'date' }),
});

export const chunksSchema = pgTable('chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').references(() => documentsSchema.id, { onDelete: 'cascade' }).notNull(),
  content: text('content').notNull(),
  position: integer('position').notNull(),
  tokenCount: integer('token_count').notNull(),
  pineconeId: text('pinecone_id').notNull().unique(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const exercisesSchema = pgTable('exercises', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => usersSchema.id).notNull(),
  type: exerciseTypeEnum('type').notNull(),
  difficulty: difficultyEnum('difficulty'),
  question: text('question').notNull(),
  exerciseData: jsonb('exercise_data').notNull(),
  sourceChunkIds: uuid('source_chunk_ids').array().notNull(),
  grammarFocus: text('grammar_focus'),
  timesAttempted: integer('times_attempted').default(0),
  averageScore: integer('average_score'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

export const responsesSchema = pgTable('responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => usersSchema.id).notNull(),
  exerciseId: uuid('exercise_id').references(() => exercisesSchema.id).notNull(),
  answer: text('answer').notNull(),
  score: integer('score').notNull(),
  rubric: jsonb('rubric').notNull(),
  overallFeedback: text('overall_feedback').notNull(),
  suggestedReview: text('suggested_review').array(),
  responseTimeMs: integer('response_time_ms'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// Type exports
export type User = typeof usersSchema.$inferSelect;
export type NewUser = typeof usersSchema.$inferInsert;
export type Document = typeof documentsSchema.$inferSelect;
export type NewDocument = typeof documentsSchema.$inferInsert;
export type Chunk = typeof chunksSchema.$inferSelect;
export type NewChunk = typeof chunksSchema.$inferInsert;
export type Exercise = typeof exercisesSchema.$inferSelect;
export type NewExercise = typeof exercisesSchema.$inferInsert;
export type Response = typeof responsesSchema.$inferSelect;
export type NewResponse = typeof responsesSchema.$inferInsert;
```

**Generate and apply migrations:**
```bash
npm run db:generate
npm run db:migrate  # For PostgreSQL
# OR for PGlite: USE_PGLITE=true npm run db:push
```

**Acceptance criteria:**
- [x] Migrations generate without errors
- [x] Tables created in database
- [x] TypeScript types exported correctly

---

### Task 4: Create Clerk Webhook for User Sync

**Files created/modified:**
- `src/app/[locale]/api/webhooks/clerk/route.ts` (create)

**Install Svix:**
```bash
npm install svix
```

**Create `src/app/[locale]/api/webhooks/clerk/route.ts`:**
```typescript
import { WebhookEvent } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { Webhook } from 'svix';
import { db } from '@/libs/DB';
import { Env } from '@/libs/Env';
import { usersSchema } from '@/models/Schema';

export async function POST(req: Request) {
  const WEBHOOK_SECRET = Env.CLERK_WEBHOOK_SECRET;

  // Get Svix headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Missing Svix headers', { status: 400 });
  }

  // Get and verify payload
  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Webhook verification failed:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  // Handle events
  switch (evt.type) {
    case 'user.created': {
      const { id } = evt.data;

      // Check if user already exists (idempotency)
      const existing = await db.query.usersSchema.findFirst({
        where: eq(usersSchema.clerkId, id),
      });

      if (!existing) {
        await db.insert(usersSchema).values({
          clerkId: id,
        });
        console.log(`Created user: ${id}`);
      }
      break;
    }

    case 'user.deleted': {
      const { id } = evt.data;
      if (id) {
        // Cascade delete will handle related records
        await db.delete(usersSchema).where(eq(usersSchema.clerkId, id));
        console.log(`Deleted user: ${id}`);
      }
      break;
    }

    default:
      console.log(`Unhandled webhook event: ${evt.type}`);
  }

  return new Response('Webhook processed', { status: 200 });
}
```

**Configure webhook in Clerk Dashboard:**
1. Go to Webhooks → Add Endpoint
2. URL: `https://your-domain.com/api/webhooks/clerk` (use ngrok for local)
3. Events: `user.created`, `user.deleted`
4. Copy Signing Secret to `CLERK_WEBHOOK_SECRET`

**Acceptance criteria:**
- [x] Webhook endpoint accessible
- [ ] User created in DB when signing up via Clerk (needs Clerk webhook config)
- [ ] User deleted from DB when deleted in Clerk Dashboard (needs Clerk webhook config)

---

### Task 5: Set Up Pinecone Client

**Files created/modified:**
- `src/libs/Pinecone.ts` (create)

**Install Pinecone SDK:**
```bash
npm install @pinecone-database/pinecone
```

**Create `src/libs/Pinecone.ts`:**
```typescript
import { Pinecone, RecordMetadata } from '@pinecone-database/pinecone';
import { Env } from './Env';

// Singleton client
const globalForPinecone = globalThis as unknown as {
  pinecone: Pinecone;
};

export const pinecone = globalForPinecone.pinecone || new Pinecone({
  apiKey: Env.PINECONE_API_KEY,
});

if (Env.NODE_ENV !== 'production') {
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
  return pinecone.index<ChunkMetadata>(PINECONE_INDEX_NAME);
}

// Get namespaced index
export function getNamespacedIndex() {
  return getIndex().namespace(PINECONE_NAMESPACE);
}

// Create index if it doesn't exist
export async function ensureIndexExists(): Promise<void> {
  const indexes = await pinecone.listIndexes();
  const indexExists = indexes.indexes?.some(idx => idx.name === PINECONE_INDEX_NAME);

  if (!indexExists) {
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
    console.log(`Created Pinecone index: ${PINECONE_INDEX_NAME}`);
  }
}

// Keep index alive (run weekly to prevent 3-week inactivity pause)
export async function keepAlive(): Promise<void> {
  const index = getIndex();
  await index.query({
    vector: Array.from({ length: MISTRAL_EMBED_DIMENSION }).fill(0),
    topK: 1,
  });
  console.log(`Pinecone keep-alive ping sent`);
}
```

**Create Pinecone index manually OR via script:**

Option 1: Pinecone Console
- Create index: `italian-learning`
- Dimension: `1024`
- Metric: `cosine`
- Cloud: `aws`
- Region: `us-east-1`

Option 2: Run initialization script (add to package.json):
```json
"scripts": {
  "pinecone:init": "npx tsx scripts/init-pinecone.ts"
}
```

**Create `scripts/init-pinecone.ts`:**
```typescript
import { ensureIndexExists } from '../src/libs/Pinecone';

async function main() {
  console.log('Ensuring Pinecone index exists...');
  await ensureIndexExists();
  console.log('Done!');
}

main().catch(console.error);
```

**Acceptance criteria:**
- [x] Pinecone index created (1024 dimensions, cosine metric) - via ensureIndexExists()
- [x] Can connect to index from app
- [x] Keep-alive function works

---

### Task 6: Set Up Mistral Client

**Files created/modified:**
- `src/libs/Mistral.ts` (create)

**Install Mistral SDK:**
```bash
npm install @mistralai/mistralai
```

**Create `src/libs/Mistral.ts`:**
```typescript
import { Mistral } from '@mistralai/mistralai';
import {
  HTTPValidationError,
  SDKValidationError,
} from '@mistralai/mistralai/models/errors';
import { Env } from './Env';

// Singleton client with retry configuration
const globalForMistral = globalThis as unknown as {
  mistral: Mistral;
};

export const mistral = globalForMistral.mistral || new Mistral({
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

if (Env.NODE_ENV !== 'production') {
  globalForMistral.mistral = mistral;
}

// Constants
const MISTRAL_EMBED_MODEL = 'mistral-embed';
const MAX_BATCH_SIZE = 16;
export const MISTRAL_EMBED_DIMENSION = 1024;

// Types
export type EmbeddingResult = {
  embeddings: number[][];
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
};

/**
 * Create embeddings for an array of texts.
 * IMPORTANT: Free tier is limited to 2 requests/minute.
 * Batch up to 16 texts per request to maximize throughput.
 * @param texts
 */
export async function createEmbeddings(texts: string[]): Promise<EmbeddingResult> {
  if (texts.length > MAX_BATCH_SIZE) {
    throw new Error(`Maximum ${MAX_BATCH_SIZE} texts per request`);
  }

  try {
    const result = await mistral.embeddings.create({
      model: MISTRAL_EMBED_MODEL,
      inputs: texts,
    });

    return {
      embeddings: result.data.map(item => item.embedding),
      usage: {
        promptTokens: result.usage.promptTokens,
        totalTokens: result.usage.totalTokens,
      },
    };
  } catch (err) {
    if (err instanceof SDKValidationError) {
      console.error('Mistral SDK validation error:', err.pretty());
      throw new Error(`Mistral validation failed: ${err.message}`);
    }

    if (err instanceof HTTPValidationError) {
      console.error('Mistral HTTP validation error:', err);
      throw new Error(`Mistral API validation failed: ${err.message}`);
    }

    throw err;
  }
}

/**
 * Create embeddings for large datasets with rate limiting.
 * WARNING: Free tier is 2 req/min - this will be slow for large datasets.
 * @param texts
 * @param onProgress
 */
export async function createEmbeddingsBatched(
  texts: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<number[][]> {
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE);
    const result = await createEmbeddings(batch);
    allEmbeddings.push(...result.embeddings);

    onProgress?.(Math.min(i + MAX_BATCH_SIZE, texts.length), texts.length);

    // Rate limit: 2 requests/min on free tier = 30s between requests
    if (i + MAX_BATCH_SIZE < texts.length) {
      console.log('Rate limiting: waiting 31s before next batch...');
      await new Promise(resolve => setTimeout(resolve, 31000));
    }
  }

  return allEmbeddings;
}

// Verify API connection
export async function verifyConnection(): Promise<boolean> {
  try {
    const result = await createEmbeddings(['test']);
    return result.embeddings.length === 1 && result.embeddings[0].length === MISTRAL_EMBED_DIMENSION;
  } catch {
    return false;
  }
}
```

**Acceptance criteria:**
- [x] Can create embeddings from text
- [x] Embeddings have correct dimension (1024)
- [x] Rate limiting works for batched requests
- [x] Retry logic handles transient failures

---

### Task 7: Create Auth Helper

**Files created/modified:**
- `src/libs/Auth.ts` (create)

**Create `src/libs/Auth.ts`:**
```typescript
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
```

**Acceptance criteria:**
- [x] `getCurrentUser()` returns user from DB
- [x] `requireUser()` throws if user not in DB
- [x] Works with async `auth()` from Clerk v6

---

### Task 8: Verification Tests

**Files created/modified:**
- `scripts/verify-setup.ts` (create)

**Create `scripts/verify-setup.ts`:**
```typescript
import { db } from '../src/libs/DB';
import { createEmbeddings, MISTRAL_EMBED_DIMENSION } from '../src/libs/Mistral';
import { ensureIndexExists, pinecone, PINECONE_INDEX_NAME } from '../src/libs/Pinecone';
import { usersSchema } from '../src/models/Schema';

async function main() {
  console.log('=== Phase 1 Setup Verification ===\n');

  // Test 1: Database connection
  console.log('1. Testing database connection...');
  try {
    const result = await db.select().from(usersSchema).limit(1);
    console.log('   ✓ Database connected\n');
  } catch (err) {
    console.error('   ✗ Database connection failed:', err);
    process.exit(1);
  }

  // Test 2: Pinecone connection
  console.log('2. Testing Pinecone connection...');
  try {
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

  // Test 3: Mistral embeddings
  console.log('3. Testing Mistral embeddings...');
  try {
    const result = await createEmbeddings(['Ciao, come stai?']);
    if (result.embeddings[0].length === MISTRAL_EMBED_DIMENSION) {
      console.log(`   ✓ Mistral embeddings working (dimension: ${MISTRAL_EMBED_DIMENSION})`);
      console.log(`   Tokens used: ${result.usage.totalTokens}\n`);
    } else {
      throw new Error(`Wrong dimension: ${result.embeddings[0].length}`);
    }
  } catch (err) {
    console.error('   ✗ Mistral embedding failed:', err);
    process.exit(1);
  }

  console.log('=== All checks passed! ===');
}

main().catch(console.error);
```

**Add to `package.json`:**
```json
"scripts": {
  "verify:setup": "npx tsx scripts/verify-setup.ts"
}
```

**Acceptance criteria:**
- [x] Database connection verified
- [ ] Pinecone index verified (requires API key)
- [ ] Mistral embeddings verified (requires API key)
- [x] All checks pass (with placeholder keys)

---

## Final Acceptance Criteria

- [x] App runs locally with `npm run dev`
- [ ] Sign-up creates user in local DB via webhook (requires Clerk webhook config)
- [x] Database migrations execute successfully
- [ ] Can create test vector in Pinecone (requires API key)
- [ ] Can call Mistral embedding endpoint (requires API key)
- [x] `npm run verify:setup` passes all checks (database verified)

---

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `.env.local` | Create | Secret environment variables |
| `src/libs/Env.ts` | Modify | Add new env var schemas |
| `src/utils/DBConnection.ts` | Modify | Add PGlite support |
| `src/models/Schema.ts` | Modify | Add database tables |
| `src/app/[locale]/api/webhooks/clerk/route.ts` | Create | Clerk user sync |
| `src/libs/Pinecone.ts` | Create | Pinecone client |
| `src/libs/Mistral.ts` | Create | Mistral client with retry |
| `src/libs/Auth.ts` | Create | Auth helper functions |
| `scripts/verify-setup.ts` | Create | Setup verification |
| `scripts/init-pinecone.ts` | Create | Index initialization |

---

## Dependencies to Install

```bash
npm install @electric-sql/pglite @pinecone-database/pinecone @mistralai/mistralai svix
```

---

## References

- [Clerk v6 Migration Guide](https://clerk.com/docs/guides/development/upgrading/upgrade-guides/nextjs-v6)
- [Clerk Webhooks](https://clerk.com/docs/guides/development/webhooks/syncing)
- [Pinecone TypeScript SDK](https://docs.pinecone.io/reference/node-sdk)
- [Mistral Embeddings](https://docs.mistral.ai/capabilities/embeddings)
- [Drizzle ORM + PGlite](https://orm.drizzle.team/docs/get-started/pglite-new)
- [ixartz Boilerplate](https://github.com/ixartz/Next-js-Boilerplate)
