import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunGenerationWorkerBatch = vi.fn();
const mockCountPendingGenerationJobs = vi.fn();

vi.mock('@/libs/ExerciseGeneration', () => ({
  runGenerationWorkerBatch: mockRunGenerationWorkerBatch,
  countPendingGenerationJobs: mockCountPendingGenerationJobs,
}));

vi.mock('@/libs/Env', () => ({
  Env: {
    GENERATION_DISPATCH_TOKEN: 'dispatch-token',
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

describe('POST /api/internal/generation-jobs/dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRunGenerationWorkerBatch.mockResolvedValue({
      claimed: 2,
      completed: 1,
      failed: 1,
    });
    mockCountPendingGenerationJobs.mockResolvedValue(5);
  });

  it('returns 401 without bearer token', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api/internal/generation-jobs/dispatch', {
      method: 'POST',
    }));

    expect(response.status).toBe(401);
    expect(mockRunGenerationWorkerBatch).not.toHaveBeenCalled();
  });

  it('runs a worker batch for authenticated requests', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api/internal/generation-jobs/dispatch', {
      method: 'POST',
      headers: {
        authorization: 'Bearer dispatch-token',
      },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockRunGenerationWorkerBatch).toHaveBeenCalledWith({ maxJobs: 10 });
    expect(body.claimed).toBe(2);
    expect(body.completed).toBe(1);
    expect(body.failed).toBe(1);
    expect(body.remainingPendingEstimate).toBe(5);
  });

  it('accepts maxJobs override in request body', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api/internal/generation-jobs/dispatch', {
      method: 'POST',
      headers: {
        'authorization': 'Bearer dispatch-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ maxJobs: 25 }),
    }));

    expect(response.status).toBe(200);
    expect(mockRunGenerationWorkerBatch).toHaveBeenCalledWith({ maxJobs: 25 });
  });

  it('returns 422 for invalid maxJobs payload', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api/internal/generation-jobs/dispatch', {
      method: 'POST',
      headers: {
        'authorization': 'Bearer dispatch-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ maxJobs: 0 }),
    }));

    expect(response.status).toBe(422);
    expect(mockRunGenerationWorkerBatch).not.toHaveBeenCalled();
  });
});
