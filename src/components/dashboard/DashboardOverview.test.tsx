import type { ComponentPropsWithoutRef } from 'react';
import type { DocumentListItem } from '@/validations/DocumentValidation';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import messages from '@/locales/en.json';
import { DashboardOverview } from './DashboardOverview';

vi.mock('@/libs/I18nNavigation', () => ({
  Link: ({ children, href, ...props }: ComponentPropsWithoutRef<'a'> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const overviewMessages = messages.DashboardOverviewPage;
const contentMessages = messages.DashboardContentPage;

function createDocument(input: Partial<DocumentListItem> = {}): DocumentListItem {
  return {
    id: '550e8400-e29b-41d4-a716-446655440010',
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

function createJsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function createSummary(documents: DocumentListItem[]) {
  return {
    documentCounts: {
      total: documents.length,
      uploading: documents.filter(document => document.status === 'uploading').length,
      processing: documents.filter(document => document.status === 'processing').length,
      ready: documents.filter(document => document.status === 'ready').length,
      failed: documents.filter(document => document.status === 'failed').length,
    },
    activeGenerationJobsCount: 0,
    recentAverageScore: null,
  };
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

describe('DashboardOverview', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('opens and closes the add-content modal while returning focus to the trigger', async () => {
    const documents = [createDocument()];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = getRequestUrl(input);
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/en/api/dashboard/summary') && method === 'GET') {
        return createJsonResponse(createSummary(documents));
      }

      if (url.endsWith('/en/api/documents') && method === 'GET') {
        return createJsonResponse({ documents });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    await render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DashboardOverview />
      </NextIntlClientProvider>,
    );

    await expect.element(page.getByText(overviewMessages.documents_card_label)).toBeInTheDocument();

    const addContentButton = page.getByRole('button', { name: overviewMessages.content_cta });

    await addContentButton.click();

    await expect.element(page.getByRole('dialog')).toBeInTheDocument();
    await expect.element(page.getByText(overviewMessages.content_modal_recent_title)).toBeInTheDocument();
    await expect.element(page.getByText('Lesson notes')).not.toBeInTheDocument();
    await expect.element(page.getByText(overviewMessages.content_modal_recent_empty)).toBeInTheDocument();

    await page.getByRole('button', { name: overviewMessages.content_modal_close }).nth(1).click();

    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
    await expect.element(addContentButton).toHaveFocus();
  });

  it('keeps the modal open after upload and refreshes dashboard counts', async () => {
    let documents = [createDocument()];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = getRequestUrl(input);
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/en/api/dashboard/summary') && method === 'GET') {
        return createJsonResponse(createSummary(documents));
      }

      if (url.endsWith('/en/api/documents') && method === 'GET') {
        return createJsonResponse({ documents });
      }

      if (url.endsWith('/en/api/documents/upload') && method === 'POST') {
        documents = [
          createDocument({
            id: '550e8400-e29b-41d4-a716-446655440020',
            title: 'Fresh article',
            contentType: 'url',
            status: 'ready',
            sourceUrl: 'https://example.com/article',
            originalFilename: null,
            createdAt: '2026-03-07T10:00:00.000Z',
          }),
          ...documents,
        ];

        return createJsonResponse({ success: true });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    await render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DashboardOverview />
      </NextIntlClientProvider>,
    );

    await expect.element(page.getByText('1', { exact: true }).nth(0)).toBeInTheDocument();

    await page.getByRole('button', { name: overviewMessages.content_cta }).click();

    await expect.element(page.getByText('Lesson notes')).not.toBeInTheDocument();

    await page.getByRole('button', { name: contentMessages.upload_mode_url }).click();
    await page.getByRole('textbox', { name: contentMessages.title_label }).fill('Fresh article');
    await page.getByRole('textbox', { name: contentMessages.url_label }).fill('https://example.com/article');
    await page.getByRole('button', { name: contentMessages.upload_submit }).click();

    await expect.element(page.getByRole('dialog')).toBeInTheDocument();
    await expect.element(page.getByText(contentMessages.upload_accepted)).toBeInTheDocument();
    await expect.element(page.getByText('Fresh article')).toBeInTheDocument();
    await expect.element(page.getByText('Lesson notes')).not.toBeInTheDocument();
    await expect.element(page.getByRole('textbox', { name: contentMessages.title_label })).toHaveValue('');
    await expect.element(page.getByRole('textbox', { name: contentMessages.url_label })).toHaveValue('');
    await expect.element(page.getByText('2', { exact: true }).nth(0)).toBeInTheDocument();
  });
});
