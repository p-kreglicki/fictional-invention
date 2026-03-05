import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireUser = vi.fn(async () => ({ id: 'user-1' }));
const mockEnqueueExerciseGeneration = vi.fn();
const mockKickGenerationWorker = vi.fn();
const mockProtect = vi.fn();
const mockWithRule = vi.fn(() => ({
  protect: mockProtect,
}));
const mockFixedWindow = vi.fn(() => []);

vi.mock('@/libs/Auth', () => ({
  requireUser: mockRequireUser,
}));

vi.mock('@/libs/ExerciseGeneration', () => ({
  enqueueExerciseGeneration: mockEnqueueExerciseGeneration,
  kickGenerationWorker: mockKickGenerationWorker,
}));

vi.mock('@arcjet/next', () => ({
  fixedWindow: mockFixedWindow,
}));

vi.mock('@/libs/Arcjet', () => ({
  default: {
    withRule: mockWithRule,
  },
}));

vi.mock('@/libs/Env', () => ({
  Env: {
    ARCJET_KEY: 'ajkey_test',
    EXERCISE_RATE_LIMIT_MAX_REQUESTS: 20,
    EXERCISE_RATE_LIMIT_WINDOW_SECONDS: 60,
  },
}));

vi.mock('@/libs/Logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function createRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/exercises/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createMalformedJsonRequest() {
  return new Request('http://localhost/api/exercises/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"documentIds":',
  });
}

describe('POST /api/exercises/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProtect.mockResolvedValue({
      isDenied: () => false,
      reason: { isRateLimit: () => false },
      results: [],
    });
  });

  it('returns 202 when job is queued', async () => {
    mockEnqueueExerciseGeneration.mockResolvedValue({
      success: true,
      jobId: 'job-1',
    });

    const { POST } = await import('./route');
    const response = await POST(createRequest({
      documentIds: ['550e8400-e29b-41d4-a716-446655440000'],
      exerciseType: 'multiple_choice',
      count: 2,
    }));
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body.jobId).toBe('job-1');
    expect(body.status).toBe('pending');
    expect(mockKickGenerationWorker).toHaveBeenCalledWith('user-1');
  });

  it('returns 404 when documents are missing', async () => {
    mockEnqueueExerciseGeneration.mockResolvedValue({
      success: false,
      errorCode: 'DOCUMENTS_NOT_FOUND',
      error: 'One or more documents were not found',
    });

    const { POST } = await import('./route');
    const response = await POST(createRequest({
      documentIds: ['550e8400-e29b-41d4-a716-446655440000'],
      exerciseType: 'fill_gap',
      count: 2,
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('DOCUMENTS_NOT_FOUND');
  });

  it('returns 500 for internal enqueue failures', async () => {
    mockEnqueueExerciseGeneration.mockResolvedValue({
      success: false,
      errorCode: 'GENERATION_FAILED',
      error: 'Failed to enqueue generation job',
    });

    const { POST } = await import('./route');
    const response = await POST(createRequest({
      documentIds: ['550e8400-e29b-41d4-a716-446655440000'],
      exerciseType: 'multiple_choice',
      count: 2,
    }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('GENERATION_FAILED');
    expect(mockKickGenerationWorker).not.toHaveBeenCalled();
  });

  it('returns 429 with headers when limiter blocks request', async () => {
    mockProtect.mockResolvedValue({
      isDenied: () => true,
      reason: {
        isRateLimit: () => true,
        max: 20,
        remaining: 0,
        reset: 60,
      },
      results: [],
    });

    const { POST } = await import('./route');
    const response = await POST(createRequest({
      documentIds: ['550e8400-e29b-41d4-a716-446655440000'],
      exerciseType: 'single_answer',
      count: 1,
    }));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBe('RATE_LIMIT_EXCEEDED');
    expect(response.headers.get('X-RateLimit-Limit')).toBe('20');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(response.headers.get('X-RateLimit-Reset')).toBe('60');
    expect(response.headers.get('Retry-After')).toBe('60');
  });

  it('returns 422 for malformed JSON payload', async () => {
    const { POST } = await import('./route');
    const response = await POST(createMalformedJsonRequest());
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe('INVALID_REQUEST');
    expect(mockEnqueueExerciseGeneration).not.toHaveBeenCalled();
    expect(mockKickGenerationWorker).not.toHaveBeenCalled();
  });
});
