import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRunGenerationWorkerBatch = vi.fn();
const mockCountPendingGenerationJobs = vi.fn();
const loggerErrorMock = vi.fn();
const mockEnv: {
  CRON_SECRET: string | undefined;
  GENERATION_DISPATCH_TOKEN: string | undefined;
} = {
  CRON_SECRET: 'cron-secret',
  GENERATION_DISPATCH_TOKEN: 'dispatch-token',
};

vi.mock('@/libs/ExerciseGeneration', () => ({
  runGenerationWorkerBatch: mockRunGenerationWorkerBatch,
  countPendingGenerationJobs: mockCountPendingGenerationJobs,
}));

vi.mock('@/libs/Env', () => ({
  Env: mockEnv,
}));

vi.mock('@/libs/Logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: loggerErrorMock,
    debug: vi.fn(),
  },
}));

describe('/api/internal/generation-jobs/dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.CRON_SECRET = 'cron-secret';
    mockEnv.GENERATION_DISPATCH_TOKEN = 'dispatch-token';
    mockRunGenerationWorkerBatch.mockResolvedValue({
      claimed: 2,
      completed: 1,
      failed: 1,
    });
    mockCountPendingGenerationJobs.mockResolvedValue(5);
  });

  it('runs a worker batch for authenticated cron GET requests', async () => {
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/internal/generation-jobs/dispatch', {
      method: 'GET',
      headers: {
        authorization: 'Bearer cron-secret',
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

  it('returns 401 for cron GET without bearer token', async () => {
    const { GET } = await import('./route');
    const response = await GET(new Request('http://localhost/api/internal/generation-jobs/dispatch', {
      method: 'GET',
    }));

    expect(response.status).toBe(401);
    expect(mockRunGenerationWorkerBatch).not.toHaveBeenCalled();
  });

  it('returns 401 without bearer token', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api/internal/generation-jobs/dispatch', {
      method: 'POST',
    }));

    expect(response.status).toBe(401);
    expect(mockRunGenerationWorkerBatch).not.toHaveBeenCalled();
  });

  it('returns 401 with invalid bearer token', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api/internal/generation-jobs/dispatch', {
      method: 'POST',
      headers: {
        authorization: 'Bearer wrong-token',
      },
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

  it('accepts requests when only CRON_SECRET is configured', async () => {
    mockEnv.GENERATION_DISPATCH_TOKEN = undefined;

    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api/internal/generation-jobs/dispatch', {
      method: 'POST',
      headers: {
        authorization: 'Bearer cron-secret',
      },
    }));

    expect(response.status).toBe(200);
    expect(mockRunGenerationWorkerBatch).toHaveBeenCalledWith({ maxJobs: 10 });
  });

  it('returns 500 when dispatch secrets are missing', async () => {
    mockEnv.CRON_SECRET = undefined;
    mockEnv.GENERATION_DISPATCH_TOKEN = undefined;

    const { POST } = await import('./route');
    const response = await POST(new Request('http://localhost/api/internal/generation-jobs/dispatch', {
      method: 'POST',
      headers: {
        authorization: 'Bearer dispatch-token',
      },
    }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('MISCONFIGURED');
    expect(mockRunGenerationWorkerBatch).not.toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledWith('generation_worker_dispatch_misconfigured');
  });
});
