import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRequireUser = vi.fn(async () => ({ id: 'user-1' }));
const mockFindDuplicateSubmission = vi.fn();
const mockEvaluateExerciseAnswer = vi.fn();
const mockRecordExerciseResponse = vi.fn();
const mockProtect = vi.fn();
const mockWithRule = vi.fn(() => ({
  protect: mockProtect,
}));
const mockFixedWindow = vi.fn(() => []);
class MockAuthenticationError extends Error {}
class MockUserNotFoundError extends Error {}
class MockExerciseNotFoundError extends Error {}
class MockAnswerEvaluationError extends Error {}

vi.mock('@/libs/Auth', () => ({
  requireUser: mockRequireUser,
  AuthenticationError: MockAuthenticationError,
  UserNotFoundError: MockUserNotFoundError,
}));

vi.mock('@/libs/ResponseSubmission', () => ({
  findDuplicateSubmission: mockFindDuplicateSubmission,
  recordExerciseResponse: mockRecordExerciseResponse,
}));

vi.mock('@/libs/AnswerEvaluation', () => ({
  evaluateExerciseAnswer: mockEvaluateExerciseAnswer,
  ExerciseNotFoundError: MockExerciseNotFoundError,
  AnswerEvaluationError: MockAnswerEvaluationError,
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
    RESPONSE_RATE_LIMIT_MAX_REQUESTS: 30,
    RESPONSE_RATE_LIMIT_WINDOW_SECONDS: 60,
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
  return new Request('http://localhost/api/responses/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function createMalformedJsonRequest() {
  return new Request('http://localhost/api/responses/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"exerciseId":',
  });
}

describe('POST /api/responses/submit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProtect.mockResolvedValue({
      isDenied: () => false,
      reason: { isRateLimit: () => false },
      results: [],
    });
    mockFindDuplicateSubmission.mockResolvedValue(null);
  });

  it('returns 200 when a response is evaluated and stored', async () => {
    mockEvaluateExerciseAnswer.mockResolvedValue({
      evaluation: {
        score: 100,
        rubric: {
          accuracy: 40,
          grammar: 30,
          fluency: 20,
          bonus: 10,
        },
        overallFeedback: 'Correct answer.',
        suggestedReview: [],
        evaluationMethod: 'deterministic',
      },
    });
    mockRecordExerciseResponse.mockResolvedValue({
      response: {
        id: 'response-1',
        exerciseId: '550e8400-e29b-41d4-a716-446655440000',
        score: 100,
        rubric: {
          accuracy: 40,
          grammar: 30,
          fluency: 20,
          bonus: 10,
        },
        overallFeedback: 'Correct answer.',
        suggestedReview: [],
        responseTimeMs: 12000,
        createdAt: '2026-03-05T10:30:00.000Z',
        evaluationMethod: 'deterministic',
      },
      exerciseStats: {
        timesAttempted: 1,
        averageScore: 100,
      },
    });

    const { POST } = await import('./route');
    const response = await POST(createRequest({
      exerciseId: '550e8400-e29b-41d4-a716-446655440000',
      answer: 1,
      clientSubmissionId: '550e8400-e29b-41d4-a716-446655440001',
      responseTimeMs: 12000,
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.response.score).toBe(100);
    expect(mockEvaluateExerciseAnswer).toHaveBeenCalledTimes(1);
    expect(mockRecordExerciseResponse).toHaveBeenCalledTimes(1);
  });

  it('returns 422 for malformed JSON payload', async () => {
    const { POST } = await import('./route');
    const response = await POST(createMalformedJsonRequest());
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe('INVALID_REQUEST');
    expect(mockEvaluateExerciseAnswer).not.toHaveBeenCalled();
    expect(mockRecordExerciseResponse).not.toHaveBeenCalled();
  });

  it('returns 422 for schema validation failures', async () => {
    const { POST } = await import('./route');
    const response = await POST(createRequest({
      exerciseId: 'not-a-uuid',
      answer: '',
      clientSubmissionId: 'not-a-uuid',
    }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe('INVALID_REQUEST');
  });

  it('returns 409 when the submission id already exists', async () => {
    mockFindDuplicateSubmission.mockResolvedValue({ id: 'response-1' });

    const { POST } = await import('./route');
    const response = await POST(createRequest({
      exerciseId: '550e8400-e29b-41d4-a716-446655440000',
      answer: 1,
      clientSubmissionId: '550e8400-e29b-41d4-a716-446655440001',
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe('DUPLICATE_SUBMISSION');
    expect(mockEvaluateExerciseAnswer).not.toHaveBeenCalled();
  });

  it('returns 401 when authentication fails', async () => {
    mockRequireUser.mockRejectedValueOnce(new MockAuthenticationError('missing'));

    const { POST } = await import('./route');
    const response = await POST(createRequest({
      exerciseId: '550e8400-e29b-41d4-a716-446655440000',
      answer: 1,
      clientSubmissionId: '550e8400-e29b-41d4-a716-446655440001',
    }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('UNAUTHORIZED');
  });

  it('returns 404 when the exercise is missing', async () => {
    mockEvaluateExerciseAnswer.mockRejectedValue(new MockExerciseNotFoundError('missing'));

    const { POST } = await import('./route');
    const response = await POST(createRequest({
      exerciseId: '550e8400-e29b-41d4-a716-446655440000',
      answer: 1,
      clientSubmissionId: '550e8400-e29b-41d4-a716-446655440001',
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('EXERCISE_NOT_FOUND');
  });

  it('returns 422 when evaluation fails', async () => {
    mockEvaluateExerciseAnswer.mockRejectedValue(new MockAnswerEvaluationError('Model output invalid'));

    const { POST } = await import('./route');
    const response = await POST(createRequest({
      exerciseId: '550e8400-e29b-41d4-a716-446655440000',
      answer: 'risposta',
      clientSubmissionId: '550e8400-e29b-41d4-a716-446655440001',
    }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe('EVALUATION_FAILED');
  });

  it('returns 429 with headers when the limiter blocks the request', async () => {
    mockProtect.mockResolvedValue({
      isDenied: () => true,
      reason: {
        isRateLimit: () => true,
        max: 30,
        remaining: 0,
        reset: 60,
      },
      results: [],
    });

    const { POST } = await import('./route');
    const response = await POST(createRequest({
      exerciseId: '550e8400-e29b-41d4-a716-446655440000',
      answer: 1,
      clientSubmissionId: '550e8400-e29b-41d4-a716-446655440001',
    }));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBe('RATE_LIMIT_EXCEEDED');
    expect(response.headers.get('X-RateLimit-Limit')).toBe('30');
    expect(response.headers.get('Retry-After')).toBe('60');
  });
});
