import type { DocumentListItem } from '@/validations/DocumentValidation';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import messages from '@/locales/en.json';
import { DocumentsWorkspace } from './DocumentsWorkspace';

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

function getRequestUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

describe('DocumentsWorkspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uploads a URL and refreshes the library', async () => {
    let documents = [createDocument()];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = getRequestUrl(input);
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

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
        <DocumentsWorkspace />
      </NextIntlClientProvider>,
    );

    await expect.element(page.getByText('Lesson notes')).toBeInTheDocument();

    await page.getByText(contentMessages.upload_mode_url, { exact: true }).click();
    await page.getByRole('textbox', { name: contentMessages.url_label }).fill('https://example.com/article');
    await page.getByRole('button', { name: contentMessages.upload_submit }).click();

    await expect.element(page.getByText(contentMessages.upload_accepted)).toBeInTheDocument();
    await expect.element(page.getByText('Fresh article')).toBeInTheDocument();
    await expect.element(page.getByRole('textbox', { name: contentMessages.url_label })).toHaveValue('');
  });

  it('deletes a document after confirmation', async () => {
    let documents = [
      createDocument(),
      createDocument({
        id: '550e8400-e29b-41d4-a716-446655440011',
        title: 'Obsolete notes',
        createdAt: '2026-03-07T10:00:00.000Z',
      }),
    ];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = getRequestUrl(input);
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/en/api/documents') && method === 'GET') {
        return createJsonResponse({ documents });
      }

      if (url.endsWith('/en/api/documents/550e8400-e29b-41d4-a716-446655440011') && method === 'DELETE') {
        documents = documents.filter(document => document.id !== '550e8400-e29b-41d4-a716-446655440011');

        return createJsonResponse({ success: true });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    await render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DocumentsWorkspace />
      </NextIntlClientProvider>,
    );

    await expect.element(page.getByText('Obsolete notes')).toBeInTheDocument();

    await page.getByRole('button', { name: contentMessages.delete_button }).nth(1).click();
    await page.getByRole('button', { name: contentMessages.delete_confirm }).click();

    await expect.element(page.getByText('Obsolete notes')).not.toBeInTheDocument();
  });

  it('polls documents while processing remains active', async () => {
    vi.useFakeTimers();

    let documentsRequestCount = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = getRequestUrl(input);
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/en/api/documents') && method === 'GET') {
        documentsRequestCount += 1;

        return createJsonResponse({
          documents: [
            createDocument({
              status: documentsRequestCount > 1 ? 'ready' : 'processing',
              title: 'Processing article',
            }),
          ],
        });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    await render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DocumentsWorkspace />
      </NextIntlClientProvider>,
    );

    await expect.element(page.getByText(contentMessages.status_processing, { exact: true })).toBeInTheDocument();

    await vi.advanceTimersByTimeAsync(2000);

    await expect.element(page.getByText(contentMessages.status_ready)).toBeInTheDocument();
  });
});
