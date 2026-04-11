import type { DocumentListItem } from '@/validations/DocumentValidation';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import messages from '@/locales/en.json';
import { TestProviders } from '@/test/TestProviders';
import { DashboardAddContentModal } from './DashboardAddContentModal';

const overviewMessages = messages.DashboardOverviewPage;
const originalXmlHttpRequest = globalThis.XMLHttpRequest;

class MockXMLHttpRequest {
  static instances: MockXMLHttpRequest[] = [];

  responseText = '';
  status = 0;
  url = '';
  listeners = new Map<string, Array<() => void>>();
  upload = {
    addEventListener: (_type: string, _listener: (event: ProgressEvent<EventTarget>) => void) => {},
  };

  open(_method: string, url: string) {
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

  respond(status: number, payload: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(payload);
    this.dispatch('load');
  }

  private dispatch(type: string) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }
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

describe('DashboardAddContentModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    MockXMLHttpRequest.instances = [];
    globalThis.XMLHttpRequest = MockXMLHttpRequest as unknown as typeof XMLHttpRequest;
  });

  afterEach(() => {
    globalThis.XMLHttpRequest = originalXmlHttpRequest;
  });

  it('re-enables closing once the pdf upload queue finishes', async () => {
    let documents: DocumentListItem[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = getRequestUrl(input);
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/en/api/documents') && method === 'GET') {
        return createJsonResponse({ documents });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    await render(
      <TestProviders>
        <DashboardAddContentModal onClose={() => {}} onSummaryRefresh={async () => {}} />
      </TestProviders>,
    );

    const closeButton = page.getByRole('button', { name: overviewMessages.content_modal_close }).nth(1);

    await expect.element(closeButton).toBeEnabled();

    queuePdfFiles([
      new File(['notes'], 'notes.pdf', { type: 'application/pdf' }),
    ]);

    await vi.waitFor(() => {
      expect(MockXMLHttpRequest.instances).toHaveLength(1);
    });

    await expect.element(closeButton).toBeDisabled();

    documents = [
      {
        id: '550e8400-e29b-41d4-a716-446655440091',
        title: 'notes',
        contentType: 'pdf',
        status: 'ready',
        searchable: true,
        chunkCount: 8,
        errorMessage: null,
        sourceUrl: null,
        originalFilename: 'notes.pdf',
        createdAt: '2026-03-07T15:00:00.000Z',
        processedAt: '2026-03-07T15:01:00.000Z',
      },
    ];
    MockXMLHttpRequest.instances[0]!.respond(202, {
      documentId: '550e8400-e29b-41d4-a716-446655440091',
      status: 'uploading',
    });
    await flushAsyncWork();

    await expect.element(closeButton).toBeEnabled();
  });
});
