import { describe, expect, it } from 'vitest';
import { parseStoredExercise } from './ExercisePresenter';

describe('parseStoredExercise', () => {
  it('rejects multiple choice exercises with duplicate options', () => {
    expect(() => parseStoredExercise({
      id: '550e8400-e29b-41d4-a716-446655440010',
      type: 'multiple_choice',
      difficulty: 'beginner',
      question: 'Quale forma e corretta?',
      exerciseData: {
        options: ['andava', 'andava', 'andranno', 'andrei'],
        correctIndex: 0,
      },
      grammarFocus: 'imperfetto',
      timesAttempted: 0,
      averageScore: null,
      createdAt: new Date('2026-03-05T10:00:00.000Z'),
    })).toThrowError(/options must contain unique values/);
  });
});
