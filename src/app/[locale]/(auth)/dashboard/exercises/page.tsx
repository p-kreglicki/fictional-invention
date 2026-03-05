import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ExercisesDashboard } from '@/components/exercises/ExercisesDashboard';

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

  return <ExercisesDashboard />;
}
