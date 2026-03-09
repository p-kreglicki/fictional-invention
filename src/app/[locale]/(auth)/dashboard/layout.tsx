import { setRequestLocale } from 'next-intl/server';
import { DashboardSidebarNav } from '@/components/dashboard/DashboardSidebarNav';
import { BaseTemplate } from '@/templates/BaseTemplate';

export default async function DashboardLayout(props: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  return (
    <BaseTemplate
      variant="dashboard"
      leftNav={<DashboardSidebarNav />}
    >
      {props.children}
    </BaseTemplate>
  );
}
