import type { GeneratedExercise } from '@/validations/ExerciseValidation';
import { and, count, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import { db } from '@/libs/DB';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import { createEmbeddings, createJsonChatCompletion, createStructuredChatCompletion } from '@/libs/Mistral';
import { getNamespacedIndex } from '@/libs/Pinecone';
import {
  chunksSchema,
  documentsSchema,
  exercisesSchema,
  generationJobsSchema,
  responsesSchema,
} from '@/models/Schema';
import {
  GeneratedExercisesResponseSchema,
  GenerateExercisesRequestSchema,
} from '@/validations/ExerciseValidation';
import { buildExerciseSystemPrompt, buildExerciseUserPrompt } from './ExercisePrompts';

const RETRIEVAL_TOP_K = 30;
const EXCERPT_SUBSET_SIZE = 3;
const MAX_GENERATION_ATTEMPTS = 3;
const DEFAULT_WORKER_BATCH_SIZE = 10;
const MAX_WORKER_BATCH_SIZE = 100;
const PENDING_STALE_JOB_THRESHOLD_MS = Env.GENERATION_PENDING_STALE_MS ?? 10 * 60 * 1000;
const PROCESSING_STALE_JOB_THRESHOLD_MS = Env.GENERATION_PROCESSING_STALE_MS ?? 20 * 60 * 1000;
const CHAT_REQUEST_DELAY_MS = Env.MISTRAL_CHAT_REQUEST_DELAY_MS ?? 0;
const LOG_PAYLOAD_EXCERPT_LENGTH = 400;

type GenerationCandidate = {
  documentId: string;
  chunkPosition: number;
  content: string;
};
type GeneratedSourceReference = GeneratedExercise['sourceReferences'][number];

type GenerationFailureCode
  = | 'VALIDATION_FAILED'
    | 'DOCUMENTS_NOT_FOUND'
    | 'DOCUMENTS_NOT_READY'
    | 'NO_CONTENT'
    | 'GENERATION_FAILED'
    | 'JOB_NOT_FOUND';

type EnqueueGenerationResult = {
  success: true;
  jobId: string;
} | {
  success: false;
  errorCode: GenerationFailureCode;
  error: string;
};

type EnqueueGenerationInput = {
  userId: string;
  request: unknown;
};

type ClaimedGenerationJob = {
  id: string;
  userId: string;
  exerciseType: 'multiple_choice' | 'fill_gap' | 'single_answer';
  documentIds: string[];
  requestedCount: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  topicFocus: string | null;
};

type GenerationWorkerBatchResult = {
  claimed: number;
  completed: number;
  failed: number;
};

const globalForGenerationWorker = globalThis as unknown as {
  exerciseGenerationWorker: Promise<unknown> | null | undefined;
};

/**
 * Evaluates whether a pending generation job is stale.
 * @param createdAt - Job creation timestamp.
 * @param now - Current timestamp used for cutoff evaluation.
 * @returns True when the job exceeds the pending stale threshold.
 */
export function isPendingGenerationJobStale(createdAt: Date, now = new Date()) {
  return createdAt.getTime() < now.getTime() - PENDING_STALE_JOB_THRESHOLD_MS;
}

/**
 * Evaluates whether a processing generation job is stale.
 * @param input - Processing timestamps and evaluation time.
 * @param input.createdAt - Job creation timestamp.
 * @param input.startedAt - Processing start timestamp, if present.
 * @param input.now - Current timestamp used for cutoff evaluation.
 * @returns True when the processing baseline exceeds the processing stale threshold.
 */
export function isProcessingGenerationJobStale(input: {
  createdAt: Date;
  startedAt: Date | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const baseline = input.startedAt ?? input.createdAt;
  return baseline.getTime() < now.getTime() - PROCESSING_STALE_JOB_THRESHOLD_MS;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function truncateForLog(value: string, maxLength = LOG_PAYLOAD_EXCERPT_LENGTH) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function summarizeValidationIssues(error: ZodError) {
  return error.issues.slice(0, 5).map(issue => ({
    path: issue.path.join('.'),
    code: issue.code,
    message: issue.message,
  }));
}

function classifyStructuredGenerationFailure(error: unknown) {
  if (error instanceof Error && error.message === 'Mistral structured output parsing failed') {
    return 'unparsable_response';
  }

  return 'provider_error';
}

function buildCandidateSubsetKey(candidates: GenerationCandidate[]) {
  return candidates
    .map(candidate => buildSourceReferenceKey(candidate))
    .join('|');
}

function normalizeGeneratedQuestion(question: string) {
  return question
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('it-IT');
}

function prepareGeneratedExerciseForInsert(
  exercise: GeneratedExercise,
  random: () => number = Math.random,
): GeneratedExercise {
  if (exercise.type !== 'multiple_choice') {
    return exercise;
  }

  const shuffledOptions = exercise.exerciseData.options.map((option, index) => ({
    option,
    isCorrect: index === exercise.exerciseData.correctIndex,
  }));

  for (let index = shuffledOptions.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = shuffledOptions[index];
    const next = shuffledOptions[swapIndex];

    if (!current || !next) {
      continue;
    }

    shuffledOptions[index] = next;
    shuffledOptions[swapIndex] = current;
  }

  return {
    ...exercise,
    exerciseData: {
      ...exercise.exerciseData,
      options: shuffledOptions.map(item => item.option),
      correctIndex: shuffledOptions.findIndex(item => item.isCorrect),
    },
  };
}

function selectCandidateSubset(
  candidates: GenerationCandidate[],
  exerciseIndex: number,
  subsetSize: number,
  attempt: number,
  usedSubsetKeys: Set<string>,
) {
  if (candidates.length <= subsetSize) {
    return candidates;
  }

  const candidateCount = candidates.length;
  const startOffset = (exerciseIndex + Math.max(attempt - 1, 0)) % candidateCount;

  for (let offset = 0; offset < candidateCount; offset += 1) {
    const selected: GenerationCandidate[] = [];
    const start = (startOffset + offset) % candidateCount;

    for (let i = 0; i < subsetSize; i += 1) {
      const index = (start + i) % candidateCount;
      const candidate = candidates[index];
      if (candidate) {
        selected.push(candidate);
      }
    }

    if (selected.length !== subsetSize) {
      continue;
    }

    const subsetKey = buildCandidateSubsetKey(selected);
    if (!usedSubsetKeys.has(subsetKey)) {
      return selected;
    }
  }

  const fallback: GenerationCandidate[] = [];
  const start = startOffset % candidateCount;
  for (let i = 0; i < subsetSize; i += 1) {
    const index = (start + i) % candidateCount;
    const candidate = candidates[index];
    if (candidate) {
      fallback.push(candidate);
    }
  }

  return fallback;
}

function buildSourceReferenceKey(input: { documentId: string; chunkPosition: number }) {
  return `${input.documentId}:${input.chunkPosition}`;
}

/**
 * Resolves generated source references against the current excerpt subset.
 * @param input - Subset candidates and generated references.
 * @param input.subset - Candidate excerpts available for the current generation attempt.
 * @param input.sourceReferences - Model-returned source references to validate and resolve.
 * @returns Matching candidates, or null when any reference is outside the subset.
 */
export function resolveGeneratedSourceReferenceCandidates(input: {
  subset: GenerationCandidate[];
  sourceReferences: GeneratedSourceReference[];
}) {
  const candidateMap = new Map<string, GenerationCandidate>();
  for (const candidate of input.subset) {
    candidateMap.set(buildSourceReferenceKey(candidate), candidate);
  }

  const selected: GenerationCandidate[] = [];
  for (const reference of input.sourceReferences) {
    const candidate = candidateMap.get(buildSourceReferenceKey(reference));
    if (!candidate) {
      return null;
    }

    selected.push(candidate);
  }

  return selected;
}

async function getCandidateChunksForRequest(input: {
  userId: string;
  documentIds: string[];
  queryText: string;
}) {
  const embeddingResult = await createEmbeddings([input.queryText]);
  const queryVector = embeddingResult.embeddings[0];
  if (!queryVector) {
    return [];
  }

  const index = getNamespacedIndex();
  const queryResult = await index.query({
    vector: queryVector,
    topK: RETRIEVAL_TOP_K,
    includeMetadata: true,
    includeValues: false,
    filter: {
      user_id: { $eq: input.userId },
      document_id: { $in: input.documentIds },
    } as never,
  });

  const candidates: GenerationCandidate[] = [];
  for (const match of queryResult.matches ?? []) {
    const metadata = match.metadata;
    if (!metadata) {
      continue;
    }

    const documentId = typeof metadata.document_id === 'string' ? metadata.document_id : null;
    const chunkPosition = typeof metadata.chunk_position === 'number' ? metadata.chunk_position : null;
    const content = typeof metadata.text === 'string' ? metadata.text : null;

    if (!documentId || chunkPosition === null || !content) {
      continue;
    }

    candidates.push({
      documentId,
      chunkPosition,
      content,
    });
  }

  return candidates;
}

async function resolveChunkIds(candidates: GenerationCandidate[]) {
  if (candidates.length === 0) {
    return [] as string[];
  }

  const documentIds = [...new Set(candidates.map(candidate => candidate.documentId))];
  const positions = [...new Set(candidates.map(candidate => candidate.chunkPosition))];

  const rows = await db
    .select({
      id: chunksSchema.id,
      documentId: chunksSchema.documentId,
      position: chunksSchema.position,
    })
    .from(chunksSchema)
    .where(and(
      inArray(chunksSchema.documentId, documentIds),
      inArray(chunksSchema.position, positions),
    ));

  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(`${row.documentId}:${row.position}`, row.id);
  }

  return candidates
    .map(candidate => map.get(`${candidate.documentId}:${candidate.chunkPosition}`))
    .filter((value): value is string => Boolean(value));
}

async function insertGeneratedExercise(input: {
  userId: string;
  generated: GeneratedExercise;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | undefined;
  topicFocus: string | undefined;
  chunkIds: string[];
  documentIds: string[];
}) {
  const generatedExercise = prepareGeneratedExerciseForInsert(input.generated);

  const [exercise] = await db
    .insert(exercisesSchema)
    .values({
      userId: input.userId,
      type: generatedExercise.type,
      difficulty: input.difficulty ?? null,
      question: generatedExercise.question,
      exerciseData: generatedExercise.exerciseData,
      sourceChunkIds: input.chunkIds,
      sourceDocumentIds: input.documentIds,
      grammarFocus: input.topicFocus ?? null,
    })
    .returning({
      id: exercisesSchema.id,
    });

  return exercise?.id ?? null;
}

async function validateDocumentsReady(input: {
  userId: string;
  documentIds: string[];
}) {
  const docs = await db
    .select({
      id: documentsSchema.id,
      status: documentsSchema.status,
    })
    .from(documentsSchema)
    .where(and(
      eq(documentsSchema.userId, input.userId),
      inArray(documentsSchema.id, input.documentIds),
    ));

  if (docs.length !== input.documentIds.length) {
    return {
      success: false,
      errorCode: 'DOCUMENTS_NOT_FOUND' as const,
      error: 'One or more documents were not found',
    };
  }

  const notReady = docs.filter(doc => doc.status !== 'ready');
  if (notReady.length > 0) {
    return {
      success: false,
      errorCode: 'DOCUMENTS_NOT_READY' as const,
      error: 'One or more documents are not ready',
    };
  }

  return {
    success: true,
  } as const;
}

async function failGenerationJob(jobId: string, errorCode: GenerationFailureCode, message: string) {
  await db
    .update(generationJobsSchema)
    .set({
      status: 'failed',
      errorMessage: errorCode,
      completedAt: new Date(),
    })
    .where(eq(generationJobsSchema.id, jobId));

  logger.error('generation_job_failed', {
    jobId,
    errorCode,
    message,
  });
}

async function incrementGenerationJobFailedCount(jobId: string) {
  await db
    .update(generationJobsSchema)
    .set({
      failedCount: sql`${generationJobsSchema.failedCount} + 1`,
    })
    .where(eq(generationJobsSchema.id, jobId));
}

async function generateSingleExercise(input: {
  systemPrompt: string;
  userPrompt: string;
}) {
  const structured = await createStructuredChatCompletion({
    systemPrompt: input.systemPrompt,
    userPrompt: input.userPrompt,
    responseFormat: GeneratedExercisesResponseSchema,
  });

  const firstExercise = structured.parsed.exercises[0];
  if (!firstExercise) {
    throw new Error('No exercise returned by structured generation');
  }

  return firstExercise;
}

async function generateSingleExerciseWithFallback(input: {
  systemPrompt: string;
  userPrompt: string;
  jobId: string;
  attempt: number;
}) {
  try {
    return await generateSingleExercise(input);
  } catch (error) {
    logger.warn('exercise_generation_structured_failed', {
      jobId: input.jobId,
      attempt: input.attempt,
      failureKind: classifyStructuredGenerationFailure(error),
      errorMessage: getErrorMessage(error),
    });

    const content = await createJsonChatCompletion({
      systemPrompt: input.systemPrompt,
      userPrompt: input.userPrompt,
    });

    try {
      const parsed = GeneratedExercisesResponseSchema.parse(JSON.parse(content));
      const firstExercise = parsed.exercises[0];
      if (!firstExercise) {
        throw new Error('No exercise returned by JSON fallback generation');
      }

      return firstExercise;
    } catch (fallbackError) {
      if (fallbackError instanceof SyntaxError) {
        logger.warn('exercise_generation_json_parse_failed', {
          jobId: input.jobId,
          attempt: input.attempt,
          errorMessage: fallbackError.message,
          rawContentExcerpt: truncateForLog(content),
        });
      } else if (fallbackError instanceof ZodError) {
        logger.warn('exercise_generation_json_validation_failed', {
          jobId: input.jobId,
          attempt: input.attempt,
          issues: summarizeValidationIssues(fallbackError),
          rawContentExcerpt: truncateForLog(content),
        });
      }

      throw fallbackError;
    }
  }
}

async function claimNextGenerationJob() {
  const now = new Date();

  return db.transaction(async (tx) => {
    const lockResult = await tx.execute(
      sql`SELECT ${generationJobsSchema.id} FROM ${generationJobsSchema} WHERE ${generationJobsSchema.status} = 'pending' ORDER BY ${generationJobsSchema.createdAt} ASC FOR UPDATE SKIP LOCKED LIMIT 1`,
    );

    const nextRow = lockResult.rows[0] as { id?: unknown } | undefined;
    const nextId = typeof nextRow?.id === 'string' ? nextRow.id : null;
    if (!nextId) {
      return null;
    }

    const [job] = await tx
      .update(generationJobsSchema)
      .set({
        status: 'processing',
        startedAt: now,
        errorMessage: null,
      })
      .where(and(
        eq(generationJobsSchema.id, nextId),
        eq(generationJobsSchema.status, 'pending'),
      ))
      .returning({
        id: generationJobsSchema.id,
        userId: generationJobsSchema.userId,
        exerciseType: generationJobsSchema.exerciseType,
        documentIds: generationJobsSchema.documentIds,
        requestedCount: generationJobsSchema.requestedCount,
        difficulty: generationJobsSchema.difficulty,
        topicFocus: generationJobsSchema.topicFocus,
      });

    if (!job) {
      return null;
    }

    return {
      ...job,
      documentIds: [...job.documentIds],
    } as ClaimedGenerationJob;
  });
}

async function runClaimedGenerationJob(job: ClaimedGenerationJob) {
  logger.info('generation_job_started', {
    jobId: job.id,
    userId: job.userId,
  });

  const parsedRequest = GenerateExercisesRequestSchema.parse({
    documentIds: job.documentIds,
    exerciseType: job.exerciseType,
    count: job.requestedCount,
    difficulty: job.difficulty ?? undefined,
    topicFocus: job.topicFocus ?? undefined,
  });

  const retrievalQuery = parsedRequest.topicFocus
    ? `${parsedRequest.exerciseType} ${parsedRequest.topicFocus}`
    : `italian ${parsedRequest.exerciseType} exercise`;

  const candidates = await getCandidateChunksForRequest({
    userId: job.userId,
    documentIds: parsedRequest.documentIds,
    queryText: retrievalQuery,
  });

  if (candidates.length === 0) {
    await failGenerationJob(job.id, 'NO_CONTENT', 'No searchable document chunks found');
    return 'failed' as const;
  }

  const systemPrompt = buildExerciseSystemPrompt();
  let generatedCount = 0;
  let failedCount = 0;
  const exerciseIds: string[] = [];
  const previousQuestions: string[] = [];
  const previousQuestionKeys = new Set<string>();
  const usedSubsetKeys = new Set<string>();

  for (let index = 0; index < parsedRequest.count; index += 1) {
    let generated = null;
    let generatedCandidates: GenerationCandidate[] | null = null;
    let generatedQuestionKey: string | null = null;
    let generatedSubsetKey: string | null = null;

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        const subset = selectCandidateSubset(
          candidates,
          index,
          EXCERPT_SUBSET_SIZE,
          attempt,
          usedSubsetKeys,
        );
        const userPrompt = buildExerciseUserPrompt({
          request: parsedRequest,
          chunks: subset.map(chunk => ({
            documentId: chunk.documentId,
            position: chunk.chunkPosition,
            content: chunk.content,
          })),
          attempt,
          exerciseNumber: index + 1,
          previousQuestions,
        });

        const result = await generateSingleExerciseWithFallback({
          systemPrompt,
          userPrompt,
          jobId: job.id,
          attempt,
        });

        if (result.type !== parsedRequest.exerciseType) {
          throw new Error(`Generated type "${result.type}" does not match requested "${parsedRequest.exerciseType}"`);
        }

        const questionKey = normalizeGeneratedQuestion(result.question);
        if (previousQuestionKeys.has(questionKey)) {
          throw new Error('Generated question duplicates a previous exercise in this job');
        }

        const referencedCandidates = resolveGeneratedSourceReferenceCandidates({
          subset,
          sourceReferences: result.sourceReferences,
        });
        if (!referencedCandidates || referencedCandidates.length === 0) {
          throw new Error('Generated source references do not match provided excerpts');
        }

        generated = result;
        generatedCandidates = referencedCandidates;
        generatedQuestionKey = questionKey;
        generatedSubsetKey = buildCandidateSubsetKey(subset);
        break;
      } catch (error) {
        logger.warn('exercise_generation_attempt_failed', {
          jobId: job.id,
          attempt,
          error,
        });

        if (attempt < MAX_GENERATION_ATTEMPTS) {
          logger.info('exercise_generation_retry', {
            jobId: job.id,
            attempt,
            nextAttempt: attempt + 1,
          });
        }
      }
    }

    if (!generated) {
      failedCount += 1;
      await incrementGenerationJobFailedCount(job.id);
      continue;
    }

    const chunkIds = await resolveChunkIds(generatedCandidates ?? []);
    if (!generatedCandidates || chunkIds.length !== generatedCandidates.length) {
      failedCount += 1;
      await incrementGenerationJobFailedCount(job.id);
      continue;
    }

    const insertedExerciseId = await insertGeneratedExercise({
      userId: job.userId,
      generated,
      difficulty: parsedRequest.difficulty,
      topicFocus: parsedRequest.topicFocus,
      chunkIds,
      documentIds: [...new Set((generatedCandidates ?? []).map(candidate => candidate.documentId))],
    });

    if (!insertedExerciseId) {
      failedCount += 1;
      await incrementGenerationJobFailedCount(job.id);
      continue;
    }

    generatedCount += 1;
    exerciseIds.push(insertedExerciseId);
    previousQuestions.push(generated.question);
    if (generatedQuestionKey) {
      previousQuestionKeys.add(generatedQuestionKey);
    }
    if (generatedSubsetKey) {
      usedSubsetKeys.add(generatedSubsetKey);
    }

    await db
      .update(generationJobsSchema)
      .set({
        generatedCount: sql`${generationJobsSchema.generatedCount} + 1`,
        exerciseIds: sql`array_append(${generationJobsSchema.exerciseIds}, ${insertedExerciseId}::uuid)`,
      })
      .where(eq(generationJobsSchema.id, job.id));

    if (CHAT_REQUEST_DELAY_MS > 0 && index < parsedRequest.count - 1) {
      await sleep(CHAT_REQUEST_DELAY_MS);
    }
  }

  const status = generatedCount > 0 ? 'completed' : 'failed';
  await db
    .update(generationJobsSchema)
    .set({
      status,
      completedAt: new Date(),
      errorMessage: status === 'failed' ? 'GENERATION_FAILED' : null,
      generatedCount,
      failedCount,
      exerciseIds,
    })
    .where(eq(generationJobsSchema.id, job.id));

  logger.info('generation_job_completed', {
    jobId: job.id,
    status,
    generatedCount,
    failedCount,
  });

  return status;
}

/**
 * Marks stale pending and processing jobs as failed.
 * @param userId - Optional user scope for stale recovery.
 * @returns Number of jobs updated.
 */
async function recoverStaleGenerationJobs(userId?: string) {
  const now = new Date();
  const stalePendingBefore = new Date(now.getTime() - PENDING_STALE_JOB_THRESHOLD_MS);
  const staleProcessingBefore = new Date(now.getTime() - PROCESSING_STALE_JOB_THRESHOLD_MS);

  const stalePendingBaseCondition = and(
    eq(generationJobsSchema.status, 'pending'),
    lt(generationJobsSchema.createdAt, stalePendingBefore),
  );

  const staleProcessingBaseCondition = and(
    eq(generationJobsSchema.status, 'processing'),
    or(
      and(isNotNull(generationJobsSchema.startedAt), lt(generationJobsSchema.startedAt, staleProcessingBefore)),
      and(isNull(generationJobsSchema.startedAt), lt(generationJobsSchema.createdAt, staleProcessingBefore)),
    ),
  );

  const stalePendingCondition = userId
    ? and(stalePendingBaseCondition, eq(generationJobsSchema.userId, userId))
    : stalePendingBaseCondition;

  const staleProcessingCondition = userId
    ? and(staleProcessingBaseCondition, eq(generationJobsSchema.userId, userId))
    : staleProcessingBaseCondition;

  const [pendingResult, processingResult] = await Promise.all([
    db
      .update(generationJobsSchema)
      .set({
        status: 'failed',
        errorMessage: 'WORKER_INTERRUPTED',
        completedAt: now,
      })
      .where(stalePendingCondition)
      .returning({ id: generationJobsSchema.id }),
    db
      .update(generationJobsSchema)
      .set({
        status: 'failed',
        errorMessage: 'WORKER_INTERRUPTED',
        completedAt: now,
      })
      .where(staleProcessingCondition)
      .returning({ id: generationJobsSchema.id }),
  ]);

  return pendingResult.length + processingResult.length;
}

function normalizeBatchSize(maxJobs: number | undefined) {
  const value = maxJobs ?? DEFAULT_WORKER_BATCH_SIZE;
  return Math.max(1, Math.min(MAX_WORKER_BATCH_SIZE, value));
}

/**
 * Processes pending generation jobs in a bounded worker batch.
 * @param input - Batch options for maximum claimed jobs and optional user-scoped stale recovery.
 * @param input.maxJobs - Maximum number of jobs to claim in this run.
 * @param input.userId - Optional user scope for stale recovery.
 * @returns Worker batch counters.
 */
export async function runGenerationWorkerBatch(input?: {
  maxJobs?: number;
  userId?: string;
}): Promise<GenerationWorkerBatchResult> {
  const maxJobs = normalizeBatchSize(input?.maxJobs);
  await recoverStaleGenerationJobs(input?.userId);

  let claimed = 0;
  let completed = 0;
  let failed = 0;

  for (let index = 0; index < maxJobs; index += 1) {
    const job = await claimNextGenerationJob();
    if (!job) {
      break;
    }

    claimed += 1;

    try {
      const status = await runClaimedGenerationJob(job);
      if (status === 'completed') {
        completed += 1;
      } else {
        failed += 1;
      }
    } catch (error) {
      failed += 1;
      logger.error('generation_job_worker_crashed', {
        jobId: job.id,
        error,
      });
      await failGenerationJob(job.id, 'GENERATION_FAILED', 'Unexpected worker failure');
    }
  }

  logger.info('generation_worker_batch_completed', {
    maxJobs,
    claimed,
    completed,
    failed,
  });

  return {
    claimed,
    completed,
    failed,
  };
}

/**
 * Counts currently pending generation jobs.
 * @returns Number of pending jobs.
 */
export async function countPendingGenerationJobs() {
  const [result] = await db
    .select({ value: count() })
    .from(generationJobsSchema)
    .where(eq(generationJobsSchema.status, 'pending'));

  return result?.value ?? 0;
}

function triggerLocalGenerationWorker(input: { userId?: string }) {
  if (globalForGenerationWorker.exerciseGenerationWorker) {
    return;
  }

  globalForGenerationWorker.exerciseGenerationWorker = runGenerationWorkerBatch({
    maxJobs: DEFAULT_WORKER_BATCH_SIZE,
    userId: input.userId,
  })
    .catch((error) => {
      logger.error('generation_worker_batch_failed', {
        error,
        userId: input.userId,
      });
    })
    .finally(() => {
      globalForGenerationWorker.exerciseGenerationWorker = null;
    });
}

/**
 * Triggers best-effort local worker processing when a new job is enqueued.
 * Production durability comes from the scheduled internal dispatch route, not
 * from the request process remaining alive after the response is returned.
 * @param userId - Optional user scope for stale recovery prior to claiming work.
 */
export function kickGenerationWorker(userId?: string) {
  triggerLocalGenerationWorker({ userId });
}

/**
 * Enqueues an exercise generation job and starts async processing.
 * @param input - User scope and request payload.
 * @returns Enqueue result with job ID or error.
 */
export async function enqueueExerciseGeneration(input: EnqueueGenerationInput): Promise<EnqueueGenerationResult> {
  const parsedRequest = GenerateExercisesRequestSchema.safeParse(input.request);
  if (!parsedRequest.success) {
    return {
      success: false,
      errorCode: 'VALIDATION_FAILED',
      error: 'Invalid generation request',
    };
  }

  const documentValidation = await validateDocumentsReady({
    userId: input.userId,
    documentIds: parsedRequest.data.documentIds,
  });
  if (!documentValidation.success) {
    return {
      success: false,
      errorCode: documentValidation.errorCode,
      error: documentValidation.error,
    };
  }

  await recoverStaleGenerationJobs(input.userId);

  const [job] = await db
    .insert(generationJobsSchema)
    .values({
      userId: input.userId,
      status: 'pending',
      exerciseType: parsedRequest.data.exerciseType,
      documentIds: parsedRequest.data.documentIds,
      requestedCount: parsedRequest.data.count,
      generatedCount: 0,
      failedCount: 0,
      exerciseIds: [],
      difficulty: parsedRequest.data.difficulty ?? null,
      topicFocus: parsedRequest.data.topicFocus ?? null,
      errorMessage: null,
    })
    .returning({
      id: generationJobsSchema.id,
    });

  if (!job?.id) {
    return {
      success: false,
      errorCode: 'GENERATION_FAILED',
      error: 'Failed to enqueue generation job',
    };
  }

  logger.info('generation_job_queued', {
    jobId: job.id,
    userId: input.userId,
    requestedCount: parsedRequest.data.count,
    exerciseType: parsedRequest.data.exerciseType,
  });

  return {
    success: true,
    jobId: job.id,
  };
}

/**
 * Fetches a generation job scoped to the given user.
 * @param jobId - Generation job ID.
 * @param userId - Authenticated user ID.
 * @returns Job with generated exercises or null when missing.
 */
export async function getGenerationJobWithExercises(jobId: string, userId: string) {
  await recoverStaleGenerationJobs(userId);

  const job = await db.query.generationJobsSchema.findFirst({
    where: and(
      eq(generationJobsSchema.id, jobId),
      eq(generationJobsSchema.userId, userId),
    ),
  });

  if (!job) {
    return null;
  }

  const exercises = job.exerciseIds.length > 0
    ? await db
        .select({
          id: exercisesSchema.id,
          type: exercisesSchema.type,
          difficulty: exercisesSchema.difficulty,
          question: exercisesSchema.question,
          exerciseData: exercisesSchema.exerciseData,
          grammarFocus: exercisesSchema.grammarFocus,
          timesAttempted: exercisesSchema.timesAttempted,
          averageScore: exercisesSchema.averageScore,
          createdAt: exercisesSchema.createdAt,
        })
        .from(exercisesSchema)
        .where(and(
          eq(exercisesSchema.userId, userId),
          inArray(exercisesSchema.id, job.exerciseIds),
        ))
        .orderBy(desc(exercisesSchema.createdAt))
    : [];

  return {
    job,
    exercises,
  };
}

/**
 * Lists recently generated exercises for a user.
 * @param userId - Authenticated user ID.
 * @param limit - Max number of exercises.
 * @returns Exercise rows sorted by newest first.
 */
export async function listRecentExercises(userId: string, limit = 50) {
  return db
    .select({
      id: exercisesSchema.id,
      type: exercisesSchema.type,
      difficulty: exercisesSchema.difficulty,
      question: exercisesSchema.question,
      exerciseData: exercisesSchema.exerciseData,
      grammarFocus: exercisesSchema.grammarFocus,
      timesAttempted: exercisesSchema.timesAttempted,
      averageScore: exercisesSchema.averageScore,
      createdAt: exercisesSchema.createdAt,
    })
    .from(exercisesSchema)
    .where(eq(exercisesSchema.userId, userId))
    .orderBy(desc(exercisesSchema.createdAt))
    .limit(limit);
}

/**
 * Lists the latest stored response for each requested exercise.
 * @param userId - Authenticated user ID.
 * @param exerciseIds - Exercise IDs to load.
 * @returns Latest response rows keyed by exercise ID.
 */
export async function listLatestResponsesForExercises(userId: string, exerciseIds: string[]) {
  if (exerciseIds.length === 0) {
    return new Map<string, never>();
  }

  const rows = await db
    .selectDistinctOn([responsesSchema.exerciseId], {
      id: responsesSchema.id,
      exerciseId: responsesSchema.exerciseId,
      score: responsesSchema.score,
      evaluationMethod: sql<'deterministic' | 'llm'>`coalesce(${responsesSchema.evaluationMethod}::text, 'deterministic')`,
      rubric: responsesSchema.rubric,
      overallFeedback: responsesSchema.overallFeedback,
      suggestedReview: responsesSchema.suggestedReview,
      responseTimeMs: responsesSchema.responseTimeMs,
      createdAt: responsesSchema.createdAt,
    })
    .from(responsesSchema)
    .where(and(
      eq(responsesSchema.userId, userId),
      inArray(responsesSchema.exerciseId, exerciseIds),
    ))
    .orderBy(
      responsesSchema.exerciseId,
      desc(responsesSchema.createdAt),
      desc(responsesSchema.id),
    );

  return new Map(rows.map(row => [row.exerciseId, row]));
}

/**
 * Lists active generation jobs for a user.
 * @param userId - Authenticated user ID.
 * @returns Active pending and processing jobs ordered by creation date.
 */
export async function listActiveGenerationJobs(userId: string) {
  await recoverStaleGenerationJobs(userId);

  return db
    .select({
      id: generationJobsSchema.id,
      status: generationJobsSchema.status,
      requestedCount: generationJobsSchema.requestedCount,
      generatedCount: generationJobsSchema.generatedCount,
      failedCount: generationJobsSchema.failedCount,
      errorMessage: generationJobsSchema.errorMessage,
      createdAt: generationJobsSchema.createdAt,
      startedAt: generationJobsSchema.startedAt,
      completedAt: generationJobsSchema.completedAt,
    })
    .from(generationJobsSchema)
    .where(and(
      eq(generationJobsSchema.userId, userId),
      or(
        eq(generationJobsSchema.status, 'pending'),
        eq(generationJobsSchema.status, 'processing'),
      ),
    ))
    .orderBy(desc(generationJobsSchema.createdAt))
    .limit(10);
}
