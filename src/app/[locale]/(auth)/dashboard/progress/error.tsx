'use client';

import { useTranslations } from 'next-intl';

export default function DashboardProgressError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('DashboardProgressPage');

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5">
      <h1 className="text-lg font-semibold text-red-800">{t('error_boundary_title')}</h1>
      <p className="mt-2 text-sm leading-6 text-red-700">{t('error_boundary_description')}</p>
      <button
        className="mt-4 rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
        onClick={() => props.reset()}
        type="button"
      >
        {t('error_boundary_retry')}
      </button>
    </div>
  );
}
