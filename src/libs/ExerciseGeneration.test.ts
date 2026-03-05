import { describe, expect, it } from 'vitest';
import {
  isPendingGenerationJobStale,
  isProcessingGenerationJobStale,
  resolveGeneratedSourceReferenceCandidates,
} from './ExerciseGeneration';

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

describe('resolveGeneratedSourceReferenceCandidates', () => {
  it('matches references by document and position', () => {
    const subset = [
      {
        documentId: '550e8400-e29b-41d4-a716-446655440000',
        chunkPosition: 0,
        content: 'Doc A chunk 0',
      },
      {
        documentId: '550e8400-e29b-41d4-a716-446655440001',
        chunkPosition: 0,
        content: 'Doc B chunk 0',
      },
    ];

    const resolved = resolveGeneratedSourceReferenceCandidates({
      subset,
      sourceReferences: [{
        documentId: '550e8400-e29b-41d4-a716-446655440001',
        chunkPosition: 0,
      }],
    });

    expect(resolved).toEqual([subset[1]]);
  });

  it('returns null when a reference is outside the subset', () => {
    const subset = [{
      documentId: '550e8400-e29b-41d4-a716-446655440000',
      chunkPosition: 0,
      content: 'Doc A chunk 0',
    }];

    const resolved = resolveGeneratedSourceReferenceCandidates({
      subset,
      sourceReferences: [{
        documentId: '550e8400-e29b-41d4-a716-446655440001',
        chunkPosition: 0,
      }],
    });

    expect(resolved).toBeNull();
  });
});
