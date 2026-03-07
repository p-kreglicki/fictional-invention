'use client';

import type { DashboardSummary } from '@/validations/DocumentValidation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/libs/I18nNavigation';
import { DashboardSummarySchema } from '@/validations/DocumentValidation';

export function DashboardOverview() {
  const locale = useLocale();
  const t = useTranslations('DashboardOverviewPage');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSummary() {
      try {
        const response = await fetch(`/${locale}/api/dashboard/summary`);
        const payload = await response.json() as unknown;

        if (!response.ok) {
          throw new Error('summary_failed');
        }

        const parsed = DashboardSummarySchema.safeParse(payload);
        if (!parsed.success) {
          throw new Error('summary_invalid');
        }

        if (!active) {
          return;
        }

        setSummary(parsed.data);
      } catch {
        if (!active) {
          return;
        }

        setErrorMessage(t('summary_error'));
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadSummary();

    return () => {
      active = false;
    };
  }, [locale, t]);

  return (
    <div className="space-y-6 py-6">
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm font-medium tracking-[0.18em] text-slate-500 uppercase">
          {t('eyebrow')}
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{t('description')}</p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/dashboard/content/"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            {t('content_cta')}
          </Link>
          <Link
            href="/dashboard/exercises/"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
          >
            {t('exercises_cta')}
          </Link>
          <Link
            href="/dashboard/progress/"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
          >
            {t('progress_cta')}
          </Link>
        </div>
      </section>

      {isLoading && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          {t('loading')}
        </section>
      )}

      {!isLoading && errorMessage && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {errorMessage}
        </section>
      )}

      {!isLoading && summary && (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <article className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-sm font-medium text-slate-500">{t('documents_card_label')}</p>
              <p className="mt-3 text-4xl font-semibold text-slate-900">{summary.documentCounts.total}</p>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-sm text-slate-600">
                <div className="rounded-md bg-slate-50 p-2">
                  <dt>{t('documents_ready')}</dt>
                  <dd className="mt-1 font-semibold text-slate-900">{summary.documentCounts.ready}</dd>
                </div>
                <div className="rounded-md bg-slate-50 p-2">
                  <dt>{t('documents_processing')}</dt>
                  <dd className="mt-1 font-semibold text-slate-900">
                    {summary.documentCounts.uploading + summary.documentCounts.processing}
                  </dd>
                </div>
                <div className="rounded-md bg-slate-50 p-2">
                  <dt>{t('documents_failed')}</dt>
                  <dd className="mt-1 font-semibold text-slate-900">{summary.documentCounts.failed}</dd>
                </div>
              </dl>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-sm font-medium text-slate-500">{t('jobs_card_label')}</p>
              <p className="mt-3 text-4xl font-semibold text-slate-900">{summary.activeGenerationJobsCount}</p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{t('jobs_card_description')}</p>
            </article>

            <article className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-sm font-medium text-slate-500">{t('score_card_label')}</p>
              <p className="mt-3 text-4xl font-semibold text-slate-900">
                {summary.recentAverageScore === null ? t('score_empty') : `${summary.recentAverageScore}/100`}
              </p>
              <p className="mt-4 text-sm leading-6 text-slate-600">{t('score_card_description')}</p>
            </article>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <article className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold text-slate-900">{t('step_content_title')}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{t('step_content_description')}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold text-slate-900">{t('step_exercises_title')}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{t('step_exercises_description')}</p>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-semibold text-slate-900">{t('step_progress_title')}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{t('step_progress_description')}</p>
            </article>
          </section>
        </>
      )}
    </div>
  );
}
