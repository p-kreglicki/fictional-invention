import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import messages from '@/locales/en.json';
import { DocumentUploadPanel } from './DocumentUploadPanel';

describe('DocumentUploadPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a client error when submitting PDF mode without a file', async () => {
    await render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DocumentUploadPanel
          errorMessage={null}
          isSubmitting={false}
          onSubmitPdf={vi.fn()}
          onSubmitText={vi.fn()}
          onSubmitUrl={vi.fn()}
          statusMessage={null}
        />
      </NextIntlClientProvider>,
    );

    await page.getByRole('button', { name: 'Upload document' }).click();

    await expect.element(page.getByText('Choose a PDF file before uploading.')).toBeInTheDocument();
  });

  it('switches to URL mode and renders the URL field', async () => {
    await render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DocumentUploadPanel
          errorMessage={null}
          isSubmitting={false}
          onSubmitPdf={vi.fn()}
          onSubmitText={vi.fn()}
          onSubmitUrl={vi.fn()}
          statusMessage={null}
        />
      </NextIntlClientProvider>,
    );

    await page.getByRole('button', { name: 'URL' }).click();

    await expect.element(page.getByRole('textbox', { name: 'HTTPS URL' })).toBeInTheDocument();
  });
});
