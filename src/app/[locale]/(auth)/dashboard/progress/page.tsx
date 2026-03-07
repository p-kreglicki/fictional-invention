import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ProgressDashboard } from '@/components/progress/ProgressDashboard';

type DashboardProgressPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: DashboardProgressPageProps): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({
    locale,
    namespace: 'DashboardProgressPage',
  });

  return {
    title: t('meta_title'),
  };
}

export default async function DashboardProgressPage(props: DashboardProgressPageProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return <ProgressDashboard />;
}
