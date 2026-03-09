import type { Preview } from '@storybook/nextjs-vite';
import { NextIntlClientProvider } from 'next-intl';
import { AppThemeProvider } from '@/components/providers/AppThemeProvider';
import { StaticRouteProvider } from '@/components/providers/StaticRouteProvider';
import messages from '@/locales/en.json';
import '../src/styles/global.css';

const preview: Preview = {
  decorators: [
    Story => (
      <NextIntlClientProvider locale="en" messages={messages}>
        <AppThemeProvider>
          <StaticRouteProvider>
            <Story />
          </StaticRouteProvider>
        </AppThemeProvider>
      </NextIntlClientProvider>
    ),
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    nextjs: {
      appDirectory: true,
    },
    docs: {
      toc: true,
    },
    a11y: {
      test: 'todo',
    },
  },
  tags: ['autodocs'],
};

export default preview;
