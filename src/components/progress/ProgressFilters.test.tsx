import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import messages from '@/locales/en.json';
import { ProgressFilters } from './ProgressFilters';

describe('ProgressFilters', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('lists available documents and reports selection changes', async () => {
    const onDocumentChange = vi.fn();

    await render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ProgressFilters
          availableDocuments={[
            {
              id: '550e8400-e29b-41d4-a716-446655440010',
              title: 'Past tense notes',
            },
            {
              id: '550e8400-e29b-41d4-a716-446655440011',
              title: 'Reading article',
            },
          ]}
          onDocumentChange={onDocumentChange}
          selectedDocumentId=""
        />
      </NextIntlClientProvider>,
    );

    await page.getByRole('combobox', { name: 'Filter by document' }).selectOptions('550e8400-e29b-41d4-a716-446655440011');

    expect(onDocumentChange).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440011');
  });
});
