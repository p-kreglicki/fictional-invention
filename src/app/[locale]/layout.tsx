import type { Metadata, Viewport } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { PostHogProvider } from '@/components/analytics/PostHogProvider';
import { DemoBadge } from '@/components/DemoBadge';
import { AppRouteProvider } from '@/components/providers/AppRouteProvider';
import { AppThemeProvider } from '@/components/providers/AppThemeProvider';
import { routing } from '@/libs/I18nRouting';
import '@/styles/global.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  icons: [
    {
      rel: 'apple-touch-icon',
      url: '/apple-touch-icon.png',
    },
    {
      rel: 'icon',
      type: 'image/png',
      sizes: '32x32',
      url: '/favicon-32x32.png',
    },
    {
      rel: 'icon',
      type: 'image/png',
      sizes: '16x16',
      url: '/favicon-16x16.png',
    },
    {
      rel: 'icon',
      url: '/favicon.ico',
    },
  ],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export function generateStaticParams() {
  return routing.locales.map(locale => ({ locale }));
}

export default async function RootLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <html lang={locale} suppressHydrationWarning className={inter.variable}>
      <body className="text-ink-900">
        <NextIntlClientProvider>
          <AppThemeProvider>
            <AppRouteProvider>
              <PostHogProvider>
                {props.children}
              </PostHogProvider>

              <DemoBadge />
            </AppRouteProvider>
          </AppThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
