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
        question: 'Completa: Io ___ al mercato ieri.',
        sourceReferences: [
          {
            documentId: '550e8400-e29b-41d4-a716-446655440000',
            chunkPosition: 0,
          },
          {
            documentId: '550e8400-e29b-41d4-a716-446655440001',
            chunkPosition: 1,
          },
        ],
        exerciseData: {
          options: ['Io andato', 'Io sono andato', 'Io andavo', 'Io andando'],
          correctIndex: 1,
        },
      }],
    });

    expect(result.success).toBe(true);
  });

  it('rejects multiple choice payload without one placeholder', () => {
    const result = GeneratedExercisesResponseSchema.safeParse({
      exercises: [{
        type: 'multiple_choice',
        question: 'Quale forma verbale corrisponde all imperfetto di fare per io?',
        sourceReferences: [{
          documentId: '550e8400-e29b-41d4-a716-446655440000',
          chunkPosition: 0,
        }],
        exerciseData: {
          options: ['facevo', 'facevi', 'faceva', 'facevano'],
          correctIndex: 0,
        },
      }],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['exercises', 0, 'question'],
        }),
      ]),
    );
  });

  it('rejects fill gap payload without one placeholder', () => {
    const result = GeneratedExercisesResponseSchema.safeParse({
      exercises: [{
        type: 'fill_gap',
        question: 'Ieri sono andato al mercato.',
        sourceReferences: [{
          documentId: '550e8400-e29b-41d4-a716-446655440000',
          chunkPosition: 2,
        }],
        exerciseData: {
          answer: 'ieri',
        },
      }],
    });

    expect(result.success).toBe(false);
  });

  it('parses topic-guided fill gap payload with multiple supporting source references', () => {
    const result = GeneratedExercisesResponseSchema.safeParse({
      exercises: [{
        type: 'fill_gap',
        question: 'Completa: Al mio paese io ___ con la mia famiglia in una casa vicina al mare.',
        sourceReferences: [
          {
            documentId: '550e8400-e29b-41d4-a716-446655440000',
            chunkPosition: 0,
          },
          {
            documentId: '550e8400-e29b-41d4-a716-446655440001',
            chunkPosition: 1,
          },
        ],
        exerciseData: {
          answer: 'vivevo',
        },
      }],
    });

    expect(result.success).toBe(true);
  });

  it('rejects duplicate source references', () => {
    const result = GeneratedExercisesResponseSchema.safeParse({
      exercises: [{
        type: 'single_answer',
        question: 'Spiega la differenza tra passato prossimo e imperfetto',
        sourceReferences: [
          {
            documentId: '550e8400-e29b-41d4-a716-446655440000',
            chunkPosition: 0,
          },
          {
            documentId: '550e8400-e29b-41d4-a716-446655440000',
            chunkPosition: 0,
          },
        ],
        exerciseData: {
          sampleAnswer: 'Dipende dalla durata e completezza dell azione.',
          gradingCriteria: ['spiega uso', 'fornisce esempio'],
        },
      }],
    });

    expect(result.success).toBe(false);
  });

  it('rejects multiple choice payload with duplicate options', () => {
    const result = GeneratedExercisesResponseSchema.safeParse({
      exercises: [{
        type: 'multiple_choice',
        question: 'Completa: Lui ___ ogni sera.',
        sourceReferences: [{
          documentId: '550e8400-e29b-41d4-a716-446655440000',
          chunkPosition: 0,
        }],
        exerciseData: {
          options: ['andava', 'andava', 'andranno', 'andrei'],
          correctIndex: 0,
        },
      }],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['exercises', 0, 'exerciseData.options'],
        }),
      ]),
    );
  });

  it('rejects multiple choice payload with flat top-level options', () => {
    const result = GeneratedExercisesResponseSchema.safeParse({
      exercises: [{
        type: 'multiple_choice',
        question: 'Completa: Tu ___ subito.',
        sourceReferences: [{
          documentId: '550e8400-e29b-41d4-a716-446655440000',
          chunkPosition: 0,
        }],
        options: ['vai', 'vada', 'andiamo', 'vanno'],
        correctIndex: 0,
      }],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['exercises', 0, 'exerciseData'],
        }),
      ]),
    );
  });
});
