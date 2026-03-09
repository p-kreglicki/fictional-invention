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

  it('shows only the five most recent documents in compact mode', async () => {
    await render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DocumentsLibrary
          description="Latest items"
          documents={[
            createDocument({
              id: '550e8400-e29b-41d4-a716-446655440100',
              title: 'Oldest document',
              createdAt: '2026-03-01T10:00:00.000Z',
            }),
            createDocument({
              id: '550e8400-e29b-41d4-a716-446655440101',
              title: 'Newest document',
              createdAt: '2026-03-07T10:00:00.000Z',
            }),
            createDocument({
              id: '550e8400-e29b-41d4-a716-446655440102',
              title: 'Fourth newest',
              createdAt: '2026-03-04T10:00:00.000Z',
            }),
            createDocument({
              id: '550e8400-e29b-41d4-a716-446655440103',
              title: 'Third newest',
              createdAt: '2026-03-05T10:00:00.000Z',
            }),
            createDocument({
              id: '550e8400-e29b-41d4-a716-446655440104',
              title: 'Fifth newest',
              createdAt: '2026-03-03T10:00:00.000Z',
            }),
            createDocument({
              id: '550e8400-e29b-41d4-a716-446655440105',
              title: 'Second newest',
              createdAt: '2026-03-06T10:00:00.000Z',
            }),
          ]}
          onDelete={vi.fn()}
          title="Recent uploads"
          variant="compact"
        />
      </NextIntlClientProvider>,
    );

    await expect.element(page.getByText('Newest document')).toBeInTheDocument();
    await expect.element(page.getByText('Second newest')).toBeInTheDocument();
    await expect.element(page.getByText('Oldest document')).not.toBeInTheDocument();
  });
});
