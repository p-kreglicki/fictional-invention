'use client';

import type { ProgressHistoryItem } from '@/validations/ResponseValidation';
import { useTranslations } from 'next-intl';
import { badgeStyles, buttonStyles, panelStyles } from '@/components/ui/styles';

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
      <section className={panelStyles()}>
        <h2 className="text-lg font-semibold text-ink-950">{t('history_title')}</h2>
        <p className="mt-2 text-sm leading-6 text-ink-600">{t('history_empty')}</p>
      </section>
    );
  }

  return (
    <section className={panelStyles()}>
      <h2 className="text-lg font-semibold text-ink-950">{t('history_title')}</h2>

      <ul className="mt-5 space-y-3">
        {props.items.map(item => (
          <li key={item.id} className="rounded-[1.5rem] border border-white/85 bg-ink-50/90 p-4 shadow-xs">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={badgeStyles({ tone: 'brand' })}>
                    {t(`exercise_type_${item.exerciseType}`)}
                  </span>
                  <span className={badgeStyles({ tone: 'success' })}>
                    {t('score_label', { score: item.score })}
                  </span>
                </div>

                <p className="mt-3 text-sm leading-6 text-ink-700">{item.overallFeedback}</p>

                <dl className="mt-4 grid gap-3 text-sm text-ink-600 md:grid-cols-2">
                  <div className="rounded-2xl bg-white/85 p-3">
                    <dt className="font-medium text-ink-900">{t('history_documents_label')}</dt>
                    <dd className="mt-1">{item.documents.map(document => document.title).join(', ')}</dd>
                  </div>
                  <div className="rounded-2xl bg-white/85 p-3">
                    <dt className="font-medium text-ink-900">{t('history_date_label')}</dt>
                    <dd className="mt-1">{new Date(item.createdAt).toLocaleString()}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {props.nextCursor && (
        <button
          className={`mt-5 ${buttonStyles()}`}
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
