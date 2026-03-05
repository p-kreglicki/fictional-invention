import type { ExerciseCardItem } from './ExerciseCards';
import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import messages from '@/locales/en.json';
import { ExerciseCards } from './ExerciseCards';

function createExercise(): ExerciseCardItem {
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

function ExerciseCardsHarness(props: {
  exercise: ExerciseCardItem;
}) {
  const [exercises, setExercises] = useState([props.exercise]);

  return (
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
      />
    </NextIntlClientProvider>
  );
}

describe('ExerciseCards', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('submits a multiple-choice answer and renders inline feedback', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      response: {
        id: '550e8400-e29b-41d4-a716-446655440020',
        exerciseId: '550e8400-e29b-41d4-a716-446655440010',
        score: 100,
        rubric: {
          accuracy: 40,
          grammar: 30,
          fluency: 20,
          bonus: 10,
        },
        overallFeedback: 'Correct answer.',
        suggestedReview: [],
        responseTimeMs: null,
        createdAt: '2026-03-05T10:05:00.000Z',
        evaluationMethod: 'deterministic',
      },
      exerciseStats: {
        timesAttempted: 1,
        averageScore: 100,
      },
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }));

    await render(<ExerciseCardsHarness exercise={createExercise()} />);

    await page.getByRole('radio').nth(0).click();
    await page.getByRole('button', { name: 'Submit answer' }).click();

    await expect.element(page.getByText('Latest feedback')).toBeInTheDocument();
    await expect.element(page.getByText('Score: 100/100')).toBeInTheDocument();
    await expect.element(page.getByText('Attempts: 1')).toBeInTheDocument();
  });

  it('keeps the submit button locked while a request is in flight', async () => {
    let resolveFetch: ((value: Response | PromiseLike<Response>) => void) | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return new Promise((resolve) => {
        resolveFetch = resolve;
      });
    });

    await render(<ExerciseCardsHarness exercise={createExercise()} />);

    await page.getByRole('radio').nth(0).click();
    await page.getByRole('button', { name: 'Submit answer' }).click();

    const button = page.getByRole('button', { name: 'Checking...' });

    await expect.element(button).toBeDisabled();

    resolveFetch?.(new Response(JSON.stringify({
      response: {
        id: '550e8400-e29b-41d4-a716-446655440020',
        exerciseId: '550e8400-e29b-41d4-a716-446655440010',
        score: 85,
        rubric: {
          accuracy: 35,
          grammar: 25,
          fluency: 17,
          bonus: 8,
        },
        overallFeedback: 'Good answer.',
        suggestedReview: ['agreement'],
        responseTimeMs: null,
        createdAt: '2026-03-05T10:05:00.000Z',
        evaluationMethod: 'deterministic',
      },
      exerciseStats: {
        timesAttempted: 1,
        averageScore: 85,
      },
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }));

    await expect.element(page.getByText('Latest feedback')).toBeInTheDocument();
  });
});
