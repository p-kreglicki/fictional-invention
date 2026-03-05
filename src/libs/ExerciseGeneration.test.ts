import { describe, expect, it } from 'vitest';
import { isPendingGenerationJobStale, isProcessingGenerationJobStale } from './ExerciseGeneration';

describe('Generation job stale thresholds', () => {
  it('marks pending jobs stale based on createdAt', () => {
    const now = new Date('2026-03-05T18:00:00.000Z');
    const staleCreatedAt = new Date('2026-03-05T17:49:59.000Z');
    const freshCreatedAt = new Date('2026-03-05T17:55:00.000Z');

    expect(isPendingGenerationJobStale(staleCreatedAt, now)).toBe(true);
    expect(isPendingGenerationJobStale(freshCreatedAt, now)).toBe(false);
  });

  it('marks processing jobs stale based on startedAt', () => {
    const now = new Date('2026-03-05T18:00:00.000Z');
    const staleStartedAt = new Date('2026-03-05T17:39:59.000Z');
    const freshStartedAt = new Date('2026-03-05T17:50:00.000Z');

    expect(isProcessingGenerationJobStale({
      createdAt: new Date('2026-03-05T17:00:00.000Z'),
      startedAt: staleStartedAt,
      now,
    })).toBe(true);

    expect(isProcessingGenerationJobStale({
      createdAt: new Date('2026-03-05T17:00:00.000Z'),
      startedAt: freshStartedAt,
      now,
    })).toBe(false);
  });

  it('falls back to createdAt for processing jobs without startedAt', () => {
    const now = new Date('2026-03-05T18:00:00.000Z');

    expect(isProcessingGenerationJobStale({
      createdAt: new Date('2026-03-05T17:39:59.000Z'),
      startedAt: null,
      now,
    })).toBe(true);

    expect(isProcessingGenerationJobStale({
      createdAt: new Date('2026-03-05T17:50:00.000Z'),
      startedAt: null,
      now,
    })).toBe(false);
  });
});
