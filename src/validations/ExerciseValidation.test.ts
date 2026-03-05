import { describe, expect, it } from 'vitest';
import {
  GeneratedExercisesResponseSchema,
  GenerateExercisesRequestSchema,
} from './ExerciseValidation';

describe('GenerateExercisesRequestSchema', () => {
  it('parses valid request payload', () => {
    const result = GenerateExercisesRequestSchema.safeParse({
      documentIds: ['550e8400-e29b-41d4-a716-446655440000'],
      exerciseType: 'multiple_choice',
      count: 4,
      difficulty: 'intermediate',
      topicFocus: 'passato prossimo',
    });

    expect(result.success).toBe(true);
  });

  it('rejects duplicate document IDs', () => {
    const duplicateId = '550e8400-e29b-41d4-a716-446655440000';
    const result = GenerateExercisesRequestSchema.safeParse({
      documentIds: [duplicateId, duplicateId],
      exerciseType: 'multiple_choice',
      count: 3,
    });

    expect(result.success).toBe(false);
  });
});

describe('GeneratedExercisesResponseSchema', () => {
  it('parses multiple choice payload', () => {
    const result = GeneratedExercisesResponseSchema.safeParse({
      exercises: [{
        type: 'multiple_choice',
        question: 'Quale frase è corretta?',
        sourceChunkPositions: [0, 1],
        exerciseData: {
          options: ['Io andato', 'Io sono andato', 'Io andavo', 'Io andando'],
          correctIndex: 1,
        },
      }],
    });

    expect(result.success).toBe(true);
  });

  it('rejects fill gap payload without one placeholder', () => {
    const result = GeneratedExercisesResponseSchema.safeParse({
      exercises: [{
        type: 'fill_gap',
        question: 'Ieri sono andato al mercato.',
        sourceChunkPositions: [2],
        exerciseData: {
          answer: 'ieri',
        },
      }],
    });

    expect(result.success).toBe(false);
  });
});
