import type { ExerciseCardItem } from './ExerciseCards';
import type { SubmitResponseSuccess } from '@/validations/ResponseValidation';
import { NextIntlClientProvider } from 'next-intl';
import { StrictMode, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import messages from '@/locales/en.json';
import { ExerciseCards } from './ExerciseCards';

const exerciseMessages = messages.DashboardExercisesPage;

function createExercise(): Extract<ExerciseCardItem, { type: 'multiple_choice' }> {
  return {
    id: '550e8400-e29b-41d4-a716-446655440010',
    type: 'multiple_choice',
    difficulty: 'beginner',
    question: 'Quale forma e corretta?',
    grammarFocus: 'passato prossimo',
    createdAt: '2026-03-05T10:00:00.000Z',
    timesAttempted: 0,
    averageScore: null,
    latestResponse: null,
    renderData: {
      options: ['Io ho visto', 'Io visto', 'Io sono vede', 'Io vedo ieri'],
    },
  };
}

function createSubmitResponsePayload(input?: {
  score?: number;
  overallFeedback?: string;
  timesAttempted?: number;
  averageScore?: number | null;
}) {
  return {
    response: {
      id: '550e8400-e29b-41d4-a716-446655440020',
      exerciseId: '550e8400-e29b-41d4-a716-446655440010',
      score: input?.score ?? 100,
      rubric: {
        accuracy: 40,
        grammar: 30,
        fluency: 20,
        bonus: 10,
      },
      overallFeedback: input?.overallFeedback ?? 'Correct answer.',
      suggestedReview: [],
      responseTimeMs: null,
      createdAt: '2026-03-05T10:05:00.000Z',
      evaluationMethod: 'deterministic' as const,
    },
    exerciseStats: {
      timesAttempted: input?.timesAttempted ?? 1,
      averageScore: input?.averageScore ?? input?.score ?? 100,
    },
  } satisfies SubmitResponseSuccess;
}

function ExerciseCardsHarness(props: {
  exercise: ExerciseCardItem;
  onExerciseSyncRequested?: (exerciseId: string) => Promise<SubmitResponseSuccess | null>;
  useStrictMode?: boolean;
}) {
  const [exercises, setExercises] = useState([props.exercise]);
  const content = (
    <NextIntlClientProvider locale="en" messages={messages}>
      <ExerciseCards
        exercises={exercises}
        apiBasePath="/en/api"
        onExerciseUpdated={(input) => {
          setExercises(current => current.map((exercise) => {
            if (exercise.id !== input.exerciseId) {
              return exercise;
            }

            return {
              ...exercise,
              latestResponse: input.latestResponse,
              timesAttempted: input.timesAttempted,
              averageScore: input.averageScore,
            };
          }));
        }}
        onExerciseSyncRequested={props.onExerciseSyncRequested}
      />
    </NextIntlClientProvider>
  );

  return props.useStrictMode ? <StrictMode>{content}</StrictMode> : content;
}

describe('ExerciseCards', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  it('submits a multiple-choice answer and renders inline feedback', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(createSubmitResponsePayload()), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }));

    await render(<ExerciseCardsHarness exercise={createExercise()} />);

    await expect.element(page.getByText(exerciseMessages.choose_correct_answer_label)).toBeInTheDocument();
    await expect.element(page.getByText('Single choice')).not.toBeInTheDocument();

    await page.getByText('Io ho visto', { exact: true }).click();
    await page.getByRole('button', { name: exerciseMessages.submit_answer_button }).click();

    await expect.element(page.getByText(exerciseMessages.latest_response_label)).toBeInTheDocument();
    await expect.element(page.getByText('Score: 100/100')).toBeInTheDocument();
    await expect.element(page.getByText(exerciseMessages.attempts_label)).not.toBeInTheDocument();
    await expect.element(page.getByText(exerciseMessages.average_score_label)).not.toBeInTheDocument();
  });

  it('renders duplicate multiple-choice labels without emitting a key warning', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await render(
      <ExerciseCardsHarness exercise={{
        ...createExercise(),
        renderData: {
          options: ['andava', 'andava', 'andranno', 'andrei'],
        },
      }}
      />,
    );

    await expect.element(page.getByText('andava', { exact: true }).nth(0)).toBeInTheDocument();
    await expect.element(page.getByText('andava', { exact: true }).nth(1)).toBeInTheDocument();

    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Encountered two children with the same key'),
    );
  });

  it('keeps the submit button locked while a request is in flight', async () => {
    let resolveFetch: ((value: Response | PromiseLike<Response>) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return new Promise((resolve) => {
        resolveFetch = resolve;
      });
    });

    await render(<ExerciseCardsHarness exercise={createExercise()} />);

    await page.getByText('Io ho visto', { exact: true }).click();
    await page.getByRole('button', { name: exerciseMessages.submit_answer_button }).click();

    const button = page.getByRole('button', { name: exerciseMessages.submit_answer_loading });

    await expect.element(button).toBeDisabled();

    resolveFetch?.(new Response(JSON.stringify(createSubmitResponsePayload({
      score: 85,
      overallFeedback: 'Good answer.',
      averageScore: 85,
    })), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }));

    await expect.element(page.getByText(exerciseMessages.latest_response_label)).toBeInTheDocument();
  });

  it('reuses the submission id when retrying the same answer', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValueOnce(new Response(JSON.stringify(createSubmitResponsePayload()), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }));

    await render(<ExerciseCardsHarness exercise={createExercise()} />);

    await page.getByText('Io ho visto', { exact: true }).click();
    await page.getByRole('button', { name: exerciseMessages.submit_answer_button }).click();

    await expect.element(page.getByText('network failed')).toBeInTheDocument();

    await page.getByRole('button', { name: exerciseMessages.submit_answer_button }).click();

    await expect.element(page.getByText(exerciseMessages.latest_response_label)).toBeInTheDocument();

    const firstRequest = fetchSpy.mock.calls[0]?.[1];
    const secondRequest = fetchSpy.mock.calls[1]?.[1];

    expect(typeof firstRequest).toBe('object');
    expect(typeof secondRequest).toBe('object');
    expect(firstRequest && typeof firstRequest === 'object' && 'body' in firstRequest).toBe(true);
    expect(secondRequest && typeof secondRequest === 'object' && 'body' in secondRequest).toBe(true);

    const firstBody = JSON.parse(String((firstRequest as RequestInit).body));
    const secondBody = JSON.parse(String((secondRequest as RequestInit).body));

    expect(firstBody.clientSubmissionId).toBe(secondBody.clientSubmissionId);
  });

  it('ignores malformed stored drafts before submitting again', async () => {
    window.sessionStorage.setItem('exercise-submission-drafts', JSON.stringify({
      '550e8400-e29b-41d4-a716-446655440010': {
        answerKey: 'number:0',
        clientSubmissionId: 'not-a-uuid',
      },
    }));

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(createSubmitResponsePayload({
      score: 92,
      overallFeedback: 'Good answer.',
      averageScore: 92,
    })), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }));

    await render(<ExerciseCardsHarness exercise={createExercise()} />);

    await page.getByText('Io ho visto', { exact: true }).click();
    await page.getByRole('button', { name: exerciseMessages.submit_answer_button }).click();

    const request = fetchSpy.mock.calls[0]?.[1];

    expect(request && typeof request === 'object' && 'body' in request).toBe(true);

    const body = JSON.parse(String((request as RequestInit).body)) as {
      clientSubmissionId: string;
    };

    expect(body.clientSubmissionId).not.toBe('not-a-uuid');
    expect(body.clientSubmissionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('completes submission in React Strict Mode without getting stuck in Checking', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(createSubmitResponsePayload()), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }));

    await render(<ExerciseCardsHarness exercise={createExercise()} useStrictMode />);

    await page.getByText('Io ho visto', { exact: true }).click();
    await page.getByRole('button', { name: exerciseMessages.submit_answer_button }).click();

    await expect.element(page.getByText(exerciseMessages.latest_response_label)).toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: exerciseMessages.submit_answer_button })).toBeInTheDocument();
  });

  it('refreshes one exercise when a 200 payload is malformed', async () => {
    const onExerciseSyncRequested = vi.fn(async () => createSubmitResponsePayload({
      score: 88,
      overallFeedback: 'Recovered from refresh.',
      averageScore: 88,
    }));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      ok: true,
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }));

    await render(
      <ExerciseCardsHarness
        exercise={createExercise()}
        onExerciseSyncRequested={onExerciseSyncRequested}
      />,
    );

    await page.getByText('Io ho visto', { exact: true }).click();
    await page.getByRole('button', { name: exerciseMessages.submit_answer_button }).click();

    await expect.element(page.getByText('Recovered from refresh.')).toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: exerciseMessages.submit_answer_button })).toBeInTheDocument();
    expect(onExerciseSyncRequested).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440010');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
