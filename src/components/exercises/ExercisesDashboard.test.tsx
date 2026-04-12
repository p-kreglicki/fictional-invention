import type { AnchorHTMLAttributes } from 'react';
import type { DocumentListItem } from '@/validations/DocumentValidation';
import type { ExerciseSet, ExerciseSetSummary } from '@/validations/ResponseValidation';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import messages from '@/locales/en.json';
import { ExercisesDashboard } from './ExercisesDashboard';

vi.mock('@/libs/I18nNavigation', () => ({
  Link: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

const exerciseMessages = messages.DashboardExercisesPage;

function createDocument(input: Partial<DocumentListItem> = {}): DocumentListItem {
  return {
    id: '550e8400-e29b-41d4-a716-446655440100',
    title: 'Lesson notes',
    contentType: 'pdf',
    status: 'ready',
    searchable: true,
    chunkCount: 12,
    errorMessage: null,
    sourceUrl: null,
    originalFilename: 'lesson-notes.pdf',
    createdAt: '2026-03-06T10:00:00.000Z',
    processedAt: '2026-03-06T10:05:00.000Z',
    ...input,
  };
}

function createExerciseSet(input: Partial<ExerciseSet> & Pick<ExerciseSet, 'id' | 'topicFocus'>): ExerciseSet {
  const exerciseId = `${input.id.slice(0, -3)}${String(Number.parseInt(input.id.slice(-3), 10) + 200).padStart(3, '0')}`;

  return {
    id: input.id,
    status: input.status ?? 'completed',
    requestedCount: input.requestedCount ?? 2,
    generatedCount: input.generatedCount ?? 2,
    failedCount: input.failedCount ?? 0,
    errorMessage: input.errorMessage ?? null,
    exerciseType: input.exerciseType ?? 'multiple_choice',
    difficulty: input.difficulty ?? 'beginner',
    topicFocus: input.topicFocus,
    createdAt: input.createdAt ?? '2026-03-05T10:00:00.000Z',
    startedAt: input.startedAt ?? '2026-03-05T10:00:02.000Z',
    completedAt: input.completedAt ?? '2026-03-05T10:00:10.000Z',
    sourceDocuments: input.sourceDocuments ?? [{
      id: '550e8400-e29b-41d4-a716-446655440100',
      title: 'Lesson notes',
    }],
    exercises: input.exercises ?? [{
      id: exerciseId,
      type: 'multiple_choice',
      difficulty: 'beginner',
      question: 'Quale forma e corretta?',
      grammarFocus: input.topicFocus,
      createdAt: '2026-03-05T10:00:10.000Z',
      timesAttempted: 0,
      averageScore: null,
      latestResponse: null,
      renderData: {
        options: ['Io ho visto', 'Io visto', 'Io sono vede', 'Io vedo ieri'],
      },
    }],
  };
}

function createActiveJob(input: Partial<ExerciseSetSummary> = {}): ExerciseSetSummary {
  return {
    id: '550e8400-e29b-41d4-a716-446655440300',
    status: 'pending',
    requestedCount: 3,
    generatedCount: 0,
    failedCount: 0,
    errorMessage: null,
    exerciseType: 'single_answer',
    difficulty: null,
    topicFocus: null,
    createdAt: '2026-03-05T10:30:00.000Z',
    startedAt: null,
    completedAt: null,
    ...input,
  };
}

function createJsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function getRequestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

async function renderDashboard() {
  await render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ExercisesDashboard />
    </NextIntlClientProvider>,
  );
}

describe('ExercisesDashboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders grouped exercise sets and separate active jobs', async () => {
    const documents = [createDocument()];
    const sets = [
      createExerciseSet({
        id: '550e8400-e29b-41d4-a716-446655440201',
        topicFocus: 'passato prossimo',
        sourceDocuments: [{ id: '550e8400-e29b-41d4-a716-446655440100', title: 'Participio Passato' }],
      }),
      createExerciseSet({
        id: '550e8400-e29b-41d4-a716-446655440202',
        status: 'failed',
        topicFocus: 'imperfetto',
        errorMessage: 'Generation failed after retries.',
        generatedCount: 1,
        sourceDocuments: [{ id: '550e8400-e29b-41d4-a716-446655440101', title: 'Imperfetto Drill' }],
      }),
    ];
    const activeJobs = [createActiveJob()];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = getRequestUrl(input);
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/en/api/documents') && method === 'GET') {
        return createJsonResponse({ documents });
      }

      if (url.endsWith('/en/api/exercises') && method === 'GET') {
        return createJsonResponse({ sets, activeJobs });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    await renderDashboard();

    await expect.element(page.getByText(exerciseMessages.results_title)).toBeInTheDocument();
    await expect.element(page.getByText('Participio Passato')).toBeInTheDocument();
    await expect.element(page.getByText('Imperfetto Drill')).toBeInTheDocument();
    await expect.element(page.getByText('2 exercises')).toBeInTheDocument();
    await expect.element(page.getByText('1 exercise')).toBeInTheDocument();
    await expect.element(page.getByText(/^Created:/).first()).toBeInTheDocument();
    await expect.element(page.getByText(exerciseMessages.jobs_title)).toBeInTheDocument();
    await expect.element(page.getByText(exerciseMessages.job_status_pending)).toBeInTheDocument();
  });

  it('deletes a completed exercise set after confirmation', async () => {
    const documents = [createDocument()];
    let sets = [
      createExerciseSet({
        id: '550e8400-e29b-41d4-a716-446655440201',
        topicFocus: 'passato prossimo',
        sourceDocuments: [{ id: '550e8400-e29b-41d4-a716-446655440100', title: 'Participio Passato' }],
      }),
      createExerciseSet({
        id: '550e8400-e29b-41d4-a716-446655440202',
        topicFocus: 'imperfetto',
        sourceDocuments: [{ id: '550e8400-e29b-41d4-a716-446655440101', title: 'Imperfetto Drill' }],
      }),
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = getRequestUrl(input);
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/en/api/documents') && method === 'GET') {
        return createJsonResponse({ documents });
      }

      if (url.endsWith('/en/api/exercises') && method === 'GET') {
        return createJsonResponse({ sets, activeJobs: [] });
      }

      if (url.endsWith('/en/api/exercises/jobs/550e8400-e29b-41d4-a716-446655440201') && method === 'DELETE') {
        sets = sets.filter(set => set.id !== '550e8400-e29b-41d4-a716-446655440201');
        return createJsonResponse({ success: true });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    await renderDashboard();

    await expect.element(page.getByText('Participio Passato')).toBeInTheDocument();

    await page.getByRole('button', { name: exerciseMessages.delete_set_button }).first().click();

    await expect.element(page.getByText(exerciseMessages.delete_set_title)).toBeInTheDocument();

    await page.getByRole('dialog').getByRole('button', { name: exerciseMessages.delete_set_confirm }).click();

    await expect.element(page.getByText('Participio Passato')).not.toBeInTheDocument();
    await expect.element(page.getByText('Imperfetto Drill')).toBeInTheDocument();
  });
});
