import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';

type DashboardExercisesPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: DashboardExercisesPageProps): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({
    locale,
    namespace: 'DashboardExercisesPage',
  });

  return {
    title: t('meta_title'),
  };
}

export default async function DashboardExercisesPage(props: DashboardExercisesPageProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const t = await getTranslations({
    locale,
    namespace: 'DashboardExercisesPage',
  });

  return (
    <section className="space-y-3 py-5">
      <h1 className="text-2xl font-semibold text-gray-900">{t('title')}</h1>
      <p className="text-sm text-gray-600">{t('description')}</p>
    </section>
  );
}
