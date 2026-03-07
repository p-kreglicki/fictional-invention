import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { DocumentsWorkspace } from '@/components/documents/DocumentsWorkspace';

type DashboardContentPageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata(props: DashboardContentPageProps): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({
    locale,
    namespace: 'DashboardContentPage',
  });

  return {
    title: t('meta_title'),
  };
}

export default async function DashboardContentPage(props: DashboardContentPageProps) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return <DocumentsWorkspace />;
}
