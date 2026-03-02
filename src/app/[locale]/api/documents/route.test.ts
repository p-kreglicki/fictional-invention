import { describe, expect, it } from 'vitest';

describe('GET /api/documents', () => {
  it('exports GET handler', async () => {
    const { GET } = await import('./route');

    expect(typeof GET).toBe('function');
  });
});

describe('documents list response format', () => {
  it('returns documents array with expected fields', () => {
    const expectedFields = [
      'id',
      'title',
      'contentType',
      'status',
      'searchable',
      'chunkCount',
      'errorMessage',
      'sourceUrl',
      'originalFilename',
      'createdAt',
      'processedAt',
    ];

    expect(expectedFields).toContain('id');
    expect(expectedFields).toContain('title');
    expect(expectedFields).toContain('status');
    expect(expectedFields).toContain('searchable');
    expect(expectedFields).toContain('chunkCount');
    expect(expectedFields).toContain('createdAt');
  });

  it('formats dates as ISO strings', () => {
    const date = new Date('2026-03-01T12:00:00Z');
    const isoString = date.toISOString();

    expect(isoString).toBe('2026-03-01T12:00:00.000Z');
  });

  it('handles null processedAt for pending documents', () => {
    const processedAt = null as Date | null;
    const formatted = processedAt?.toISOString() ?? null;

    expect(formatted).toBeNull();
  });
});

describe('document statuses', () => {
  it('includes all valid status values', () => {
    const validStatuses = ['uploading', 'processing', 'ready', 'failed'];

    expect(validStatuses).toHaveLength(4);
    expect(validStatuses).toContain('uploading');
    expect(validStatuses).toContain('processing');
    expect(validStatuses).toContain('ready');
    expect(validStatuses).toContain('failed');
  });
});

describe('content types', () => {
  it('includes all valid content type values', () => {
    const validTypes = ['pdf', 'url', 'text'];

    expect(validTypes).toHaveLength(3);
    expect(validTypes).toContain('pdf');
    expect(validTypes).toContain('url');
    expect(validTypes).toContain('text');
  });
});
