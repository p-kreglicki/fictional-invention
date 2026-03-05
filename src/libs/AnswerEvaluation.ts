import type { StoredExercise } from './ExercisePresenter';
import type { EvaluationResult } from '@/validations/ResponseValidation';
import { and, eq } from 'drizzle-orm';
import * as z from 'zod';
import { db } from '@/libs/DB';
import { logger } from '@/libs/Logger';
import { createStructuredChatCompletion } from '@/libs/Mistral';
import { exercisesSchema } from '@/models/Schema';
import { EvaluationResultSchema } from '@/validations/ResponseValidation';
import {
  buildEvaluationSystemPrompt,
  buildFillGapFallbackUserPrompt,
  buildSingleAnswerUserPrompt,
} from './AnswerEvaluationPrompts';
import { parseStoredExercise } from './ExercisePresenter';

const LlmEvaluationSchema = z.object({
  score: z.number().int().min(0).max(100),
  rubric: z.object({
    accuracy: z.number().int().min(0).max(40),
    grammar: z.number().int().min(0).max(30),
    fluency: z.number().int().min(0).max(20),
    bonus: z.number().int().min(0).max(10),
  }),
  overallFeedback: z.string().trim().min(1).max(1000),
  suggestedReview: z.array(z.string().trim().min(1).max(120)).max(10),
  corrections: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
});

export class ExerciseNotFoundError extends Error {
  constructor() {
    super('Exercise not found');
    this.name = 'ExerciseNotFoundError';
  }
}

export class AnswerEvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnswerEvaluationError';
  }
}

function buildDeterministicRubric(score: number) {
  if (score >= 100) {
    return {
      accuracy: 40,
      grammar: 30,
      fluency: 20,
      bonus: 10,
    };
  }

  return {
    accuracy: 0,
    grammar: 0,
    fluency: 0,
    bonus: 0,
  };
}

function foldDiacritics(value: string) {
  return value.normalize('NFD').replace(/\p{M}+/gu, '');
}

function normalizeComparableText(value: string) {
  return foldDiacritics(
    value
      .normalize('NFC')
      .replace(/[’`´]/g, '\'')
      .replace(/[.,!?;:()[\]{}"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('it-IT'),
  );
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) {
    return 0;
  }

  if (left.length === 0) {
    return right.length;
  }

  if (right.length === 0) {
    return left.length;
  }

  const previous: number[] = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current: number[] = Array.from({ length: right.length + 1 }, () => 0);

  for (let row = 1; row <= left.length; row += 1) {
    current[0] = row;

    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;

      current[column] = Math.min(
        current[column - 1]! + 1,
        previous[column]! + 1,
        previous[column - 1]! + substitutionCost,
      );
    }

    for (let column = 0; column <= right.length; column += 1) {
      previous[column] = current[column]!;
    }
  }

  return previous[right.length]!;
}

function isFillGapNearMatch(input: {
  acceptedAnswers: string[];
  userAnswer: string;
}) {
  const normalizedUserAnswer = normalizeComparableText(input.userAnswer);

  if (normalizedUserAnswer.length < 2 || normalizedUserAnswer.length > 120) {
    return false;
  }

  return input.acceptedAnswers.some((answer) => {
    const normalizedAccepted = normalizeComparableText(answer);

    if (
      normalizedAccepted.includes(normalizedUserAnswer)
      || normalizedUserAnswer.includes(normalizedAccepted)
    ) {
      return true;
    }

    return levenshteinDistance(normalizedUserAnswer, normalizedAccepted) <= 2;
  });
}

function buildCorrectFeedback(exercise: StoredExercise) {
  if (exercise.type === 'multiple_choice') {
    return exercise.exerciseData.explanation ?? 'Correct answer.';
  }

  if (exercise.type === 'fill_gap') {
    return 'Correct answer.';
  }

  return 'Strong answer.';
}

function buildIncorrectFeedback(exercise: StoredExercise) {
  if (exercise.type === 'multiple_choice') {
    const correctOption = exercise.exerciseData.options[exercise.exerciseData.correctIndex];
    return `Incorrect. The correct answer is "${correctOption}".`;
  }

  if (exercise.type === 'fill_gap') {
    return `Incorrect. A valid answer is "${exercise.exerciseData.answer}".`;
  }

  return 'The answer does not meet the expected criteria.';
}

async function evaluateWithLlm(input: {
  exercise: StoredExercise;
  userAnswer: string;
}) {
  const systemPrompt = buildEvaluationSystemPrompt();

  if (input.exercise.type === 'fill_gap') {
    const result = await createStructuredChatCompletion({
      systemPrompt,
      userPrompt: buildFillGapFallbackUserPrompt({
        question: input.exercise.question,
        acceptedAnswers: [
          input.exercise.exerciseData.answer,
          ...(input.exercise.exerciseData.acceptedAnswers ?? []),
        ],
        userAnswer: input.userAnswer,
        grammarFocus: input.exercise.grammarFocus,
      }),
      responseFormat: LlmEvaluationSchema,
      temperature: 0,
      maxTokens: 500,
    });

    return EvaluationResultSchema.parse({
      ...result.parsed,
      evaluationMethod: 'llm',
    });
  }

  if (input.exercise.type !== 'single_answer') {
    throw new AnswerEvaluationError('Unsupported LLM evaluation request');
  }

  const result = await createStructuredChatCompletion({
    systemPrompt,
    userPrompt: buildSingleAnswerUserPrompt({
      question: input.exercise.question,
      sampleAnswer: input.exercise.exerciseData.sampleAnswer,
      gradingCriteria: input.exercise.exerciseData.gradingCriteria,
      userAnswer: input.userAnswer,
      grammarFocus: input.exercise.grammarFocus,
    }),
    responseFormat: LlmEvaluationSchema,
    temperature: 0,
    maxTokens: 700,
  });

  return EvaluationResultSchema.parse({
    ...result.parsed,
    evaluationMethod: 'llm',
  });
}

function evaluateDeterministic(input: {
  exercise: StoredExercise;
  answer: string | number;
}): EvaluationResult | null {
  if (input.exercise.type === 'multiple_choice') {
    if (typeof input.answer !== 'number') {
      throw new AnswerEvaluationError('Multiple choice answers must use an option index');
    }

    const isCorrect = input.answer === input.exercise.exerciseData.correctIndex;
    const score = isCorrect ? 100 : 0;

    return EvaluationResultSchema.parse({
      score,
      rubric: buildDeterministicRubric(score),
      overallFeedback: isCorrect
        ? buildCorrectFeedback(input.exercise)
        : buildIncorrectFeedback(input.exercise),
      suggestedReview: isCorrect
        ? []
        : [input.exercise.grammarFocus ?? 'answer accuracy'],
      evaluationMethod: 'deterministic',
    });
  }

  if (typeof input.answer !== 'string') {
    throw new AnswerEvaluationError('Text answers must be submitted as strings');
  }

  if (input.exercise.type === 'fill_gap') {
    const acceptedAnswers = [
      input.exercise.exerciseData.answer,
      ...(input.exercise.exerciseData.acceptedAnswers ?? []),
    ];
    const normalizedAnswer = normalizeComparableText(input.answer);
    const isCorrect = acceptedAnswers.some(answer => normalizeComparableText(answer) === normalizedAnswer);

    if (isCorrect) {
      return EvaluationResultSchema.parse({
        score: 100,
        rubric: buildDeterministicRubric(100),
        overallFeedback: buildCorrectFeedback(input.exercise),
        suggestedReview: [],
        evaluationMethod: 'deterministic',
      });
    }

    if (!isFillGapNearMatch({
      acceptedAnswers,
      userAnswer: input.answer,
    })) {
      return EvaluationResultSchema.parse({
        score: 0,
        rubric: buildDeterministicRubric(0),
        overallFeedback: buildIncorrectFeedback(input.exercise),
        suggestedReview: [input.exercise.grammarFocus ?? 'verb forms'],
        evaluationMethod: 'deterministic',
      });
    }

    return null;
  }

  return null;
}

async function loadExerciseForEvaluation(input: {
  userId: string;
  exerciseId: string;
}) {
  const [exercise] = await db
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
      eq(exercisesSchema.id, input.exerciseId),
      eq(exercisesSchema.userId, input.userId),
    ));

  if (!exercise) {
    throw new ExerciseNotFoundError();
  }

  return parseStoredExercise(exercise);
}

export async function evaluateExerciseAnswer(input: {
  userId: string;
  exerciseId: string;
  answer: string | number;
}) {
  const startedAt = Date.now();
  const exercise = await loadExerciseForEvaluation({
    userId: input.userId,
    exerciseId: input.exerciseId,
  });

  logger.info('answer_evaluation_started', {
    exerciseId: input.exerciseId,
    exerciseType: exercise.type,
  });

  try {
    const deterministic = evaluateDeterministic({
      exercise,
      answer: input.answer,
    });

    const evaluation = deterministic ?? await evaluateWithLlm({
      exercise,
      userAnswer: String(input.answer),
    });

    logger.info('answer_evaluation_completed', {
      exerciseId: input.exerciseId,
      exerciseType: exercise.type,
      evaluationMethod: evaluation.evaluationMethod,
      latencyMs: Date.now() - startedAt,
      score: evaluation.score,
    });

    return {
      exercise,
      evaluation,
    };
  } catch (error) {
    logger.error('answer_evaluation_failed', {
      exerciseId: input.exerciseId,
      exerciseType: exercise.type,
      latencyMs: Date.now() - startedAt,
      error,
    });

    if (error instanceof AnswerEvaluationError) {
      throw error;
    }

    throw new AnswerEvaluationError('Failed to evaluate answer');
  }
}
