import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// This file defines the structure of your database tables using the Drizzle ORM.

// To modify the database schema:
// 1. Update this file with your desired changes.
// 2. Generate a new migration by running: `npm run db:generate`

// The generated migration file will reflect your schema changes.
// It automatically run the command `db-server:file`, which apply the migration before Next.js starts in development mode,
// Alternatively, if your database is running, you can run `npm run db:migrate` and there is no need to restart the server.

// Need a database for production? Check out https://www.prisma.io/?via=nextjsboilerplate
// Tested and compatible with Next.js Boilerplate

export const counterSchema = pgTable('counter', {
  id: serial('id').primaryKey(),
  count: integer('count').default(0),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
});

// ============================================
// Italian RAG Learning Tool Schema
// ============================================

// Enums
export const documentStatusEnum = pgEnum('document_status', [
  'uploading',
  'processing',
  'ready',
  'failed',
]);

export const contentTypeEnum = pgEnum('content_type', [
  'pdf',
  'url',
  'text',
]);

export const exerciseTypeEnum = pgEnum('exercise_type', [
  'multiple_choice',
  'fill_gap',
  'single_answer',
]);

export const difficultyEnum = pgEnum('difficulty', [
  'beginner',
  'intermediate',
  'advanced',
]);

export const generationJobStatusEnum = pgEnum('generation_job_status', [
  'pending',
  'processing',
  'completed',
  'failed',
]);

export const evaluationMethodEnum = pgEnum('evaluation_method', [
  'deterministic',
  'llm',
]);

// Users table (synced from Clerk via webhook)
export const usersSchema = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkId: text('clerk_id').notNull().unique(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Documents table (uploaded content)
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
}, table => ({
  documentsUserCreatedIdx: index('documents_user_created_idx').on(
    table.userId,
    table.createdAt.desc(),
  ),
}));

// Chunks table (document segments with embeddings)
export const chunksSchema = pgTable('chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  documentId: uuid('document_id').references(() => documentsSchema.id, { onDelete: 'cascade' }).notNull(),
  content: text('content').notNull(),
  position: integer('position').notNull(),
  tokenCount: integer('token_count').notNull(),
  pineconeId: text('pinecone_id').notNull().unique(),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, table => ({
  chunksDocumentIdx: index('chunks_document_id_idx').on(table.documentId),
}));

// Exercises table (generated exercises)
export const exercisesSchema = pgTable('exercises', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => usersSchema.id, { onDelete: 'cascade' }).notNull(),
  type: exerciseTypeEnum('type').notNull(),
  difficulty: difficultyEnum('difficulty'),
  question: text('question').notNull(),
  exerciseData: jsonb('exercise_data').notNull(),
  sourceChunkIds: uuid('source_chunk_ids').array().notNull(),
  sourceDocumentIds: uuid('source_document_ids').array().notNull(),
  grammarFocus: text('grammar_focus'),
  timesAttempted: integer('times_attempted').default(0),
  averageScore: integer('average_score'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, table => ({
  exercisesSourceDocumentIdsIdx: index('exercises_source_document_ids_idx').using(
    'gin',
    sql`${table.sourceDocumentIds}`,
  ),
}));

// Responses table (user answers and evaluations)
export const responsesSchema = pgTable('responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => usersSchema.id, { onDelete: 'cascade' }).notNull(),
  exerciseId: uuid('exercise_id').references(() => exercisesSchema.id, { onDelete: 'cascade' }).notNull(),
  clientSubmissionId: uuid('client_submission_id'),
  answer: text('answer').notNull(),
  score: integer('score').notNull(),
  evaluationMethod: evaluationMethodEnum('evaluation_method'),
  rubric: jsonb('rubric').notNull(),
  overallFeedback: text('overall_feedback').notNull(),
  suggestedReview: text('suggested_review').array(),
  responseTimeMs: integer('response_time_ms'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
}, table => ({
  userSubmissionIdx: uniqueIndex('responses_user_submission_unique_idx').on(
    table.userId,
    table.clientSubmissionId,
  ).where(sql`${table.clientSubmissionId} is not null`),
  exerciseUserCreatedIdx: index('responses_exercise_user_created_idx').on(
    table.exerciseId,
    table.userId,
    table.createdAt,
  ),
  userCreatedIdx: index('responses_user_created_idx').on(
    table.userId,
    table.createdAt.desc(),
    table.id.desc(),
  ),
}));

// Generation jobs table (async exercise generation lifecycle)
export const generationJobsSchema = pgTable('generation_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => usersSchema.id, { onDelete: 'cascade' }).notNull(),
  status: generationJobStatusEnum('status').default('pending').notNull(),
  exerciseType: exerciseTypeEnum('exercise_type').notNull(),
  documentIds: uuid('document_ids').array().notNull(),
  requestedCount: integer('requested_count').notNull(),
  generatedCount: integer('generated_count').default(0).notNull(),
  failedCount: integer('failed_count').default(0).notNull(),
  exerciseIds: uuid('exercise_ids').array().default(sql`'{}'::uuid[]`).notNull(),
  difficulty: difficultyEnum('difficulty'),
  topicFocus: text('topic_focus'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow().notNull(),
  startedAt: timestamp('started_at', { mode: 'date' }),
  completedAt: timestamp('completed_at', { mode: 'date' }),
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
export type GenerationJob = typeof generationJobsSchema.$inferSelect;
export type NewGenerationJob = typeof generationJobsSchema.$inferInsert;
