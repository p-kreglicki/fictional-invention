import type { DocumentListItem } from '@/validations/DocumentValidation';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import messages from '@/locales/en.json';
import { DocumentsLibrary } from './DocumentsLibrary';

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

describe('DocumentsLibrary', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders document metadata and status labels', async () => {
    await render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DocumentsLibrary
          documents={[
            createDocument(),
            createDocument({
              id: '550e8400-e29b-41d4-a716-446655440011',
              title: 'Broken URL import',
              contentType: 'url',
              status: 'failed',
              searchable: false,
              chunkCount: 0,
              errorMessage: 'Failed to extract URL content.',
              sourceUrl: 'https://example.com/article',
              originalFilename: null,
              processedAt: null,
            }),
          ]}
          onDelete={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    await expect.element(page.getByText('Lesson notes')).toBeInTheDocument();
    await expect.element(page.getByText('Ready')).toBeInTheDocument();
    await expect.element(page.getByText('Broken URL import')).toBeInTheDocument();
    await expect.element(page.getByText('Failed', { exact: true })).toBeInTheDocument();
    await expect.element(page.getByText('Failed to extract URL content.')).toBeInTheDocument();
  });
});
