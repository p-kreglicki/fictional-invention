import type { PdfUploadSessionItem } from './useDocumentsWorkspace';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import messages from '@/locales/en.json';
import { TestProviders } from '@/test/TestProviders';
import { DocumentUploadPanel } from './DocumentUploadPanel';

const contentMessages = messages.DashboardContentPage;

function createPdfUpload(input: Partial<PdfUploadSessionItem> = {}): PdfUploadSessionItem {
  return {
    id: 'upload-1',
    documentId: null,
    errorMessage: null,
    file: new File(['pdf'], 'lesson-notes.pdf', { type: 'application/pdf' }),
    name: 'lesson-notes.pdf',
    phase: 'queued',
    progress: 0,
    size: 720 * 1024,
    ...input,
  };
}

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
        onStartPdfUploads={vi.fn()}
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

describe('DocumentUploadPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a client error when submitting PDF mode without queued files', async () => {
    await render(
      <TestProviders>
        <DocumentUploadPanel
          errorMessage={null}
          isSubmitting={false}
          onDismissPdfUpload={vi.fn()}
          onQueuePdfFiles={vi.fn()}
          onRetryPdfUpload={vi.fn()}
          onStartPdfUploads={vi.fn()}
          onSubmitText={vi.fn()}
          onSubmitUrl={vi.fn()}
          pdfUploads={[]}
          statusMessage={null}
        />
      </TestProviders>,
    );

    await page.getByRole('button', { name: contentMessages.upload_submit_pdf }).click();

    await expect.element(page.getByText(contentMessages.pdf_missing_file)).toBeInTheDocument();
  });

  it('starts queued PDF uploads from the submit action', async () => {
    const onStartPdfUploads = vi.fn();

    await render(
      <TestProviders>
        <DocumentUploadPanel
          errorMessage={null}
          isSubmitting={false}
          onDismissPdfUpload={vi.fn()}
          onQueuePdfFiles={vi.fn()}
          onRetryPdfUpload={vi.fn()}
          onStartPdfUploads={onStartPdfUploads}
          onSubmitText={vi.fn()}
          onSubmitUrl={vi.fn()}
          pdfUploads={[createPdfUpload()]}
          statusMessage={null}
        />
      </TestProviders>,
    );

    await expect.element(page.getByText('lesson-notes.pdf')).toBeInTheDocument();
    await expect.element(page.getByText(contentMessages.upload_status_queued)).toBeInTheDocument();

    await page.getByRole('button', { name: contentMessages.upload_submit_pdf }).click();

    expect(onStartPdfUploads).toHaveBeenCalledTimes(1);
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
          onStartPdfUploads={vi.fn()}
          onSubmitText={vi.fn()}
          onSubmitUrl={vi.fn()}
          pdfUploads={[]}
          statusMessage={null}
        />
      </TestProviders>,
    );

    await page.getByText(contentMessages.upload_mode_url, { exact: true }).click();

    await expect.element(page.getByRole('textbox', { name: contentMessages.url_label })).toBeInTheDocument();
    await expect.element(page.getByRole('textbox', { name: contentMessages.title_label })).not.toBeInTheDocument();
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
