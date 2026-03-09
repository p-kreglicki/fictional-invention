import type { ComponentPropsWithoutRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';
import messages from '@/locales/en.json';
import { TestProviders } from '@/test/TestProviders';
import { DashboardOverview } from './DashboardOverview';

vi.mock('@/libs/I18nNavigation', () => ({
  Link: ({ children, href, ...props }: ComponentPropsWithoutRef<'a'> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const overviewMessages = messages.DashboardOverviewPage;
const contentMessages = messages.DashboardContentPage;

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

describe('DashboardOverview', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the upload panel inline on the dashboard', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = getRequestUrl(input);
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/en/api/documents') && method === 'GET') {
        return createJsonResponse({ documents: [] });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    await render(
      <TestProviders>
        <DashboardOverview />
      </TestProviders>,
    );

    await expect.element(page.getByRole('heading', { name: overviewMessages.title })).toBeInTheDocument();
    await expect.element(page.getByRole('heading', { name: contentMessages.upload_title })).toBeInTheDocument();
    await expect.element(page.getByRole('button', { name: contentMessages.upload_submit })).toBeInTheDocument();
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
  });

  it('uploads a URL from the inline dashboard widget and resets the form', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = getRequestUrl(input);
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');

      if (url.endsWith('/en/api/documents') && method === 'GET') {
        return createJsonResponse({ documents: [] });
      }

      if (url.endsWith('/en/api/documents/upload') && method === 'POST') {
        return createJsonResponse({ success: true });
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    });

    await render(
      <TestProviders>
        <DashboardOverview />
      </TestProviders>,
    );

    await page.getByText(contentMessages.upload_mode_url, { exact: true }).click();
    await page.getByRole('textbox', { name: contentMessages.url_label }).fill('https://example.com/article');
    await page.getByRole('button', { name: contentMessages.upload_submit }).click();

    await expect.element(page.getByText(contentMessages.upload_accepted)).toBeInTheDocument();
    await expect.element(page.getByRole('textbox', { name: contentMessages.url_label })).toHaveValue('');
  });
});
