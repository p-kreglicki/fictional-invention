'use client';

import { NextIntlClientProvider } from 'next-intl';
import { AppThemeProvider } from '@/components/providers/AppThemeProvider';
import { StaticRouteProvider } from '@/components/providers/StaticRouteProvider';
import messages from '@/locales/en.json';

/**
 * Wrap UI tests with the shared application providers.
 * @param props - Test wrapper children and locale.
 * @param props.children
 * @param props.locale
 * @returns Provider tree for component tests.
 */
export function TestProviders(props: {
  children: React.ReactNode;
  locale?: 'en' | 'fr';
}) {
  const locale = props.locale ?? 'en';

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AppThemeProvider>
        <StaticRouteProvider>
          {props.children}
        </StaticRouteProvider>
      </AppThemeProvider>
    </NextIntlClientProvider>
  );
}
