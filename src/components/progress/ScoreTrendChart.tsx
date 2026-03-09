'use client';

import type { ScoreTrendPoint } from '@/validations/ResponseValidation';
import { useTranslations } from 'next-intl';
import { panelStyles } from '@/components/ui/styles';

type ScoreTrendChartProps = {
  averageScore: number | null;
  points: ScoreTrendPoint[];
};

export function ScoreTrendChart(props: ScoreTrendChartProps) {
  const t = useTranslations('DashboardProgressPage');

  return (
    <section className={panelStyles()}>
      <h2 className="text-lg font-semibold text-ink-950">{t('trend_title')}</h2>
      <p className="mt-2 text-sm leading-6 text-ink-600">
        {props.averageScore === null
          ? t('trend_empty')
          : t('trend_average', { score: props.averageScore })}
      </p>

      {props.points.length > 0 && (
        <div className="mt-5 flex h-44 items-end gap-2 rounded-[1.5rem] bg-ink-50/85 p-4">
          {props.points.map(point => (
            <div key={point.createdAt} className="flex flex-1 flex-col items-center gap-2">
              <div
                aria-label={t('trend_point_label', {
                  date: new Date(point.createdAt).toLocaleDateString(),
                  score: point.score,
                })}
                className="w-full rounded-t-2xl bg-linear-to-t from-brand-600 to-brand-300 shadow-xs"
                style={{ height: `${Math.max(point.score, 6)}%` }}
              />
              <span className="text-[11px] text-ink-500">{point.score}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
