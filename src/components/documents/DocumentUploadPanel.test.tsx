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
        onSubmitPdf={vi.fn()}
        onSubmitText={vi.fn()}
        onSubmitUrl={vi.fn()}
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

  it('shows a client error when submitting PDF mode without a file', async () => {
    await render(
      <TestProviders>
        <DocumentUploadPanel
          errorMessage={null}
          isSubmitting={false}
          onSubmitPdf={vi.fn()}
          onSubmitText={vi.fn()}
          onSubmitUrl={vi.fn()}
          statusMessage={null}
        />
      </TestProviders>,
    );

    await page.getByRole('button', { name: contentMessages.upload_submit }).click();

    await expect.element(page.getByText(contentMessages.pdf_missing_file)).toBeInTheDocument();
  });

  it('switches to URL mode and renders the URL field', async () => {
    await render(
      <TestProviders>
        <DocumentUploadPanel
          errorMessage={null}
          isSubmitting={false}
          onSubmitPdf={vi.fn()}
          onSubmitText={vi.fn()}
          onSubmitUrl={vi.fn()}
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
