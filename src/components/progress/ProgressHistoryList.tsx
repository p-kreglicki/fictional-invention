'use client';

import type { ProgressHistoryItem } from '@/validations/ResponseValidation';
import { useTranslations } from 'next-intl';

type ProgressHistoryListProps = {
  items: ProgressHistoryItem[];
  nextCursor: string | null;
  isLoadingMore: boolean;
  onLoadMore: () => Promise<void>;
};

export function ProgressHistoryList(props: ProgressHistoryListProps) {
  const t = useTranslations('DashboardProgressPage');

  if (props.items.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">{t('history_title')}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{t('history_empty')}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-slate-900">{t('history_title')}</h2>

      <ul className="mt-5 space-y-3">
        {props.items.map(item => (
          <li key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white">
                    {t(`exercise_type_${item.exerciseType}`)}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    {t('score_label', { score: item.score })}
                  </span>
                </div>

                <p className="mt-3 text-sm leading-6 text-slate-700">{item.overallFeedback}</p>

                <dl className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                  <div>
                    <dt className="font-medium text-slate-900">{t('history_documents_label')}</dt>
                    <dd>{item.documents.map(document => document.title).join(', ')}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-slate-900">{t('history_date_label')}</dt>
                    <dd>{new Date(item.createdAt).toLocaleString()}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {props.nextCursor && (
        <button
          className="mt-5 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={props.isLoadingMore}
          onClick={() => {
            void props.onLoadMore();
          }}
          type="button"
        >
          {props.isLoadingMore ? t('history_loading_more') : t('history_load_more')}
        </button>
      )}
    </section>
  );
}
