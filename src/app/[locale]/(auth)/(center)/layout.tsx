import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AppConfig } from '@/utils/AppConfig';

export default async function CenteredLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations({
    locale,
    namespace: 'AuthLayout',
  });

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-4xl rounded-[2rem] border border-white/80 bg-white/88 p-4 shadow-panel backdrop-blur sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(20rem,0.9fr)] lg:items-center">
          <section className="rounded-[1.75rem] bg-linear-to-br from-brand-600 via-brand-700 to-ink-950 p-6 text-white shadow-lg">
            <p className="text-sm font-semibold tracking-[0.24em] uppercase">{AppConfig.name}</p>
            <h1 className="mt-6 text-3xl font-semibold">{t('title')}</h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/80">
              {t('description')}
            </p>
          </section>

          <section className="rounded-[1.75rem] border border-ink-100 bg-white p-4 shadow-sm sm:p-6">
            {props.children}
          </section>
        </div>
      </div>
    </div>
  );
}
