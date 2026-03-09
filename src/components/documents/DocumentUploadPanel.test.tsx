import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import messages from '@/locales/en.json';
import { TestProviders } from '@/test/TestProviders';
import { DocumentUploadPanel } from './DocumentUploadPanel';

const contentMessages = messages.DashboardContentPage;

function DocumentUploadPanelHarness() {
  const [resetKey, setResetKey] = useState(0);

  return (
    <>
      <button onClick={() => setResetKey(current => current + 1)} type="button">
        Reset form
      </button>

      <DocumentUploadPanel
        errorMessage={null}
        isSubmitting={false}
        onDismissPdfUpload={vi.fn()}
        onQueuePdfFiles={vi.fn()}
        onRetryPdfUpload={vi.fn()}
        onSubmitText={vi.fn()}
        onSubmitUrl={vi.fn()}
        pdfUploads={[]}
        resetKey={resetKey}
        statusMessage={null}
        variant="modal"
      />
    </>
  );
}

function selectFiles(files: File[]) {
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

describe('DocumentUploadPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('queues PDFs immediately when selected and hides the PDF submit button', async () => {
    const onQueuePdfFiles = vi.fn();

    await render(
      <TestProviders>
        <DocumentUploadPanel
          errorMessage={null}
          isSubmitting={false}
          onDismissPdfUpload={vi.fn()}
          onQueuePdfFiles={onQueuePdfFiles}
          onRetryPdfUpload={vi.fn()}
          onSubmitText={vi.fn()}
          onSubmitUrl={vi.fn()}
          pdfUploads={[]}
          statusMessage={null}
        />
      </TestProviders>,
    );

    await expect.element(page.getByRole('button', { name: contentMessages.upload_submit_pdf })).not.toBeInTheDocument();

    selectFiles([
      new File(['pdf'], 'lesson-notes.pdf', { type: 'application/pdf' }),
    ]);

    expect(onQueuePdfFiles).toHaveBeenCalledTimes(1);
    expect(Array.from(onQueuePdfFiles.mock.calls[0]![0] as FileList).map(file => file.name)).toEqual(['lesson-notes.pdf']);
  });

  it('switches to URL mode and renders the URL field', async () => {
    await render(
      <TestProviders>
        <DocumentUploadPanel
          errorMessage={null}
          isSubmitting={false}
          onDismissPdfUpload={vi.fn()}
          onQueuePdfFiles={vi.fn()}
          onRetryPdfUpload={vi.fn()}
          onSubmitText={vi.fn()}
          onSubmitUrl={vi.fn()}
          pdfUploads={[]}
          statusMessage={null}
        />
      </TestProviders>,
    );

    await page.getByText(contentMessages.upload_mode_url, { exact: true }).click();

    await expect.element(page.getByRole('textbox', { name: contentMessages.url_label })).toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: contentMessages.upload_submit })).toBeInTheDocument();
    await expect.element(page.getByRole('textbox', { name: contentMessages.title_label })).not.toBeInTheDocument();
  });

  it('shows a validation error for rejected or oversized PDF selections', async () => {
    const onQueuePdfFiles = vi.fn();

    await render(
      <TestProviders>
        <DocumentUploadPanel
          errorMessage={null}
          isSubmitting={false}
          onDismissPdfUpload={vi.fn()}
          onQueuePdfFiles={onQueuePdfFiles}
          onRetryPdfUpload={vi.fn()}
          onSubmitText={vi.fn()}
          onSubmitUrl={vi.fn()}
          pdfUploads={[]}
          statusMessage={null}
        />
      </TestProviders>,
    );

    selectFiles([
      new File(['text'], 'notes.txt', { type: 'text/plain' }),
    ]);

    await expect.element(page.getByText(contentMessages.upload_validation_error)).toBeInTheDocument();
    expect(onQueuePdfFiles).not.toHaveBeenCalled();

    selectFiles([
      new File([new Uint8Array((10 * 1024 * 1024) + 1)], 'oversized.pdf', { type: 'application/pdf' }),
    ]);

    await expect.element(page.getByText(contentMessages.upload_validation_error)).toBeInTheDocument();
    expect(onQueuePdfFiles).not.toHaveBeenCalled();
  });

  it('hides the page heading in modal mode and resets fields after success', async () => {
    await render(
      <TestProviders>
        <DocumentUploadPanelHarness />
      </TestProviders>,
    );

    await expect.element(page.getByText(contentMessages.upload_title)).not.toBeInTheDocument();

    await page.getByText(contentMessages.upload_mode_url, { exact: true }).click();
    await page.getByRole('textbox', { name: contentMessages.url_label }).fill('https://example.com/article');

    await page.getByRole('button', { name: 'Reset form' }).click();

    await expect.element(page.getByRole('textbox', { name: contentMessages.url_label })).toHaveValue('');
  });
});
