import type { DocumentListItem } from '@/validations/DocumentValidation';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import messages from '@/locales/en.json';
import { DocumentsWorkspace } from './DocumentsWorkspace';

const contentMessages = messages.DashboardContentPage;
const originalXmlHttpRequest = globalThis.XMLHttpRequest;

class MockXMLHttpRequest {
  static instances: MockXMLHttpRequest[] = [];

  method = '';
  responseText = '';
  status = 0;
  url = '';
  uploadListeners: Array<(event: ProgressEvent<EventTarget>) => void> = [];
  listeners = new Map<string, Array<() => void>>();
  upload = {
    addEventListener: (type: string, listener: (event: ProgressEvent<EventTarget>) => void) => {
      if (type === 'progress') {
        this.uploadListeners.push(listener);
      }
    },
  };

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  addEventListener(type: string, listener: () => void) {
    const nextListeners = this.listeners.get(type) ?? [];
    nextListeners.push(listener);
    this.listeners.set(type, nextListeners);
  }

  send() {
    MockXMLHttpRequest.instances.push(this);
  }

  abort() {
    this.dispatch('abort');
  }

  emitProgress(loaded: number, total: number) {
    const event = {
      lengthComputable: true,
      loaded,
      total,
    } as ProgressEvent<EventTarget>;

    this.uploadListeners.forEach(listener => listener(event));
  }

  respond(status: number, payload: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(payload);
    this.dispatch('load');
  }

  fail() {
    this.dispatch('error');
  }

  private dispatch(type: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }
}

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

function queuePdfFiles(files: File[]) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;

  expect(input).not.toBeNull();

  const dataTransfer = new DataTransfer();
  files.forEach(file => dataTransfer.items.add(file));

  Object.defineProperty(input!, 'files', {
    configurable: true,
    value: dataTransfer.files,
  });

  input!.dispatchEvent(new Event('change', { bubbles: true }));
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('DocumentsWorkspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    MockXMLHttpRequest.instances = [];
    globalThis.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.XMLHttpRequest = originalXmlHttpRequest;
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

  it('uploads queued PDFs sequentially and marks them complete after processing', async () => {
    let documents = [createDocument()];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = getRequestUrl(input);
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/en/api/documents') && method === 'GET') {
        return createJsonResponse({ documents });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    await render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DocumentsWorkspace />
      </NextIntlClientProvider>,
    );

    queuePdfFiles([
      new File(['first'], 'first.pdf', { type: 'application/pdf' }),
      new File(['second'], 'second.pdf', { type: 'application/pdf' }),
    ]);

    await expect.element(page.getByText('first.pdf')).toBeInTheDocument();
    await expect.element(page.getByText('second.pdf')).toBeInTheDocument();

    await vi.waitFor(() => {
      expect(MockXMLHttpRequest.instances).toHaveLength(1);
    });

    MockXMLHttpRequest.instances[0]!.emitProgress(5, 10);

    await expect.element(page.getByText('50%')).toBeInTheDocument();

    documents = [
      createDocument({
        id: '550e8400-e29b-41d4-a716-446655440021',
        title: 'first',
        status: 'processing',
        originalFilename: 'first.pdf',
        createdAt: '2026-03-07T10:00:00.000Z',
      }),
      ...documents,
    ];
    MockXMLHttpRequest.instances[0]!.respond(202, { documentId: '550e8400-e29b-41d4-a716-446655440021', status: 'uploading' });
    await flushAsyncWork();

    await vi.waitFor(() => {
      expect(MockXMLHttpRequest.instances).toHaveLength(2);
    });

    documents = [
      createDocument({
        id: '550e8400-e29b-41d4-a716-446655440021',
        title: 'first',
        status: 'ready',
        originalFilename: 'first.pdf',
        createdAt: '2026-03-07T10:00:00.000Z',
        processedAt: '2026-03-07T10:05:00.000Z',
      }),
      createDocument({
        id: '550e8400-e29b-41d4-a716-446655440022',
        title: 'second',
        status: 'ready',
        originalFilename: 'second.pdf',
        createdAt: '2026-03-07T10:01:00.000Z',
        processedAt: '2026-03-07T10:05:30.000Z',
      }),
      createDocument(),
    ];
    MockXMLHttpRequest.instances[1]!.respond(202, { documentId: '550e8400-e29b-41d4-a716-446655440022', status: 'uploading' });
    await flushAsyncWork();

    await vi.waitFor(() => {
      expect(page.getByText(contentMessages.upload_status_completed).elements()).toHaveLength(2);
    });

    expect(MockXMLHttpRequest.instances[0]!.url.endsWith('/en/api/documents/upload')).toBe(true);
    expect(MockXMLHttpRequest.instances[1]!.url.endsWith('/en/api/documents/upload')).toBe(true);
  });

  it('appends PDFs added during an active upload and continues the queue automatically', async () => {
    let documents = [createDocument()];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = getRequestUrl(input);
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/en/api/documents') && method === 'GET') {
        return createJsonResponse({ documents });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    await render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DocumentsWorkspace />
      </NextIntlClientProvider>,
    );

    queuePdfFiles([
      new File(['first'], 'first.pdf', { type: 'application/pdf' }),
    ]);

    await vi.waitFor(() => {
      expect(MockXMLHttpRequest.instances).toHaveLength(1);
    });

    queuePdfFiles([
      new File(['second'], 'second.pdf', { type: 'application/pdf' }),
      new File(['third'], 'third.pdf', { type: 'application/pdf' }),
    ]);

    await expect.element(page.getByText('second.pdf')).toBeInTheDocument();
    await expect.element(page.getByText('third.pdf')).toBeInTheDocument();

    documents = [
      createDocument({
        id: '550e8400-e29b-41d4-a716-446655440031',
        title: 'first',
        status: 'ready',
        originalFilename: 'first.pdf',
        createdAt: '2026-03-07T12:00:00.000Z',
        processedAt: '2026-03-07T12:05:00.000Z',
      }),
      ...documents,
    ];
    MockXMLHttpRequest.instances[0]!.respond(202, { documentId: '550e8400-e29b-41d4-a716-446655440031', status: 'uploading' });
    await flushAsyncWork();

    await vi.waitFor(() => {
      expect(MockXMLHttpRequest.instances).toHaveLength(2);
    });

    documents = [
      createDocument({
        id: '550e8400-e29b-41d4-a716-446655440031',
        title: 'first',
        status: 'ready',
        originalFilename: 'first.pdf',
        createdAt: '2026-03-07T12:00:00.000Z',
        processedAt: '2026-03-07T12:05:00.000Z',
      }),
      createDocument({
        id: '550e8400-e29b-41d4-a716-446655440032',
        title: 'second',
        status: 'ready',
        originalFilename: 'second.pdf',
        createdAt: '2026-03-07T12:01:00.000Z',
        processedAt: '2026-03-07T12:06:00.000Z',
      }),
      ...documents.filter(document => document.id !== '550e8400-e29b-41d4-a716-446655440031'),
    ];
    MockXMLHttpRequest.instances[1]!.respond(202, { documentId: '550e8400-e29b-41d4-a716-446655440032', status: 'uploading' });
    await flushAsyncWork();

    await vi.waitFor(() => {
      expect(MockXMLHttpRequest.instances).toHaveLength(3);
    });

    documents = [
      createDocument({
        id: '550e8400-e29b-41d4-a716-446655440031',
        title: 'first',
        status: 'ready',
        originalFilename: 'first.pdf',
        createdAt: '2026-03-07T12:00:00.000Z',
        processedAt: '2026-03-07T12:05:00.000Z',
      }),
      createDocument({
        id: '550e8400-e29b-41d4-a716-446655440032',
        title: 'second',
        status: 'ready',
        originalFilename: 'second.pdf',
        createdAt: '2026-03-07T12:01:00.000Z',
        processedAt: '2026-03-07T12:06:00.000Z',
      }),
      createDocument({
        id: '550e8400-e29b-41d4-a716-446655440033',
        title: 'third',
        status: 'ready',
        originalFilename: 'third.pdf',
        createdAt: '2026-03-07T12:02:00.000Z',
        processedAt: '2026-03-07T12:07:00.000Z',
      }),
      createDocument(),
    ];
    MockXMLHttpRequest.instances[2]!.respond(202, { documentId: '550e8400-e29b-41d4-a716-446655440033', status: 'uploading' });
    await flushAsyncWork();

    await vi.waitFor(() => {
      expect(page.getByText(contentMessages.upload_status_completed).elements()).toHaveLength(3);
    });
  });

  it('retries a failed processed PDF by deleting the failed document first', async () => {
    let documents: DocumentListItem[] = [];
    const deletedDocumentIds: string[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = getRequestUrl(input);
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/en/api/documents') && method === 'GET') {
        return createJsonResponse({ documents });
      }

      if (url.endsWith('/en/api/documents/550e8400-e29b-41d4-a716-446655440023') && method === 'DELETE') {
        deletedDocumentIds.push('550e8400-e29b-41d4-a716-446655440023');
        documents = documents.filter(document => document.id !== '550e8400-e29b-41d4-a716-446655440023');
        return createJsonResponse({ success: true });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    await render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DocumentsWorkspace />
      </NextIntlClientProvider>,
    );

    queuePdfFiles([
      new File(['retry'], 'retry.pdf', { type: 'application/pdf' }),
    ]);

    await vi.waitFor(() => {
      expect(MockXMLHttpRequest.instances).toHaveLength(1);
    });

    documents = [
      createDocument({
        id: '550e8400-e29b-41d4-a716-446655440023',
        title: 'retry',
        status: 'failed',
        errorMessage: 'PDF extraction failed',
        originalFilename: 'retry.pdf',
        createdAt: '2026-03-07T11:00:00.000Z',
      }),
    ];
    MockXMLHttpRequest.instances[0]!.respond(202, { documentId: '550e8400-e29b-41d4-a716-446655440023', status: 'uploading' });
    await flushAsyncWork();

    await expect.element(page.getByText('PDF extraction failed')).toBeInTheDocument();

    await page.getByRole('button', { name: contentMessages.upload_retry }).click();

    await vi.waitFor(() => {
      expect(deletedDocumentIds).toEqual(['550e8400-e29b-41d4-a716-446655440023']);
      expect(MockXMLHttpRequest.instances).toHaveLength(2);
    });

    documents = [
      createDocument({
        id: '550e8400-e29b-41d4-a716-446655440024',
        title: 'retry',
        status: 'ready',
        originalFilename: 'retry.pdf',
        createdAt: '2026-03-07T11:02:00.000Z',
        processedAt: '2026-03-07T11:03:00.000Z',
      }),
    ];
    MockXMLHttpRequest.instances[1]!.respond(202, { documentId: '550e8400-e29b-41d4-a716-446655440024', status: 'uploading' });
    await flushAsyncWork();

    await expect.element(page.getByText(contentMessages.upload_status_completed)).toBeInTheDocument();
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
