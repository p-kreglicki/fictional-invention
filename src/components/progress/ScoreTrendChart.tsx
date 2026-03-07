'use client';

import type { ScoreTrendPoint } from '@/validations/ResponseValidation';
import { useTranslations } from 'next-intl';

type ScoreTrendChartProps = {
  averageScore: number | null;
  points: ScoreTrendPoint[];
};

export function ScoreTrendChart(props: ScoreTrendChartProps) {
  const t = useTranslations('DashboardProgressPage');

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-slate-900">{t('trend_title')}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        {props.averageScore === null
          ? t('trend_empty')
          : t('trend_average', { score: props.averageScore })}
      </p>

      {props.points.length > 0 && (
        <div className="mt-5 flex h-40 items-end gap-2">
          {props.points.map(point => (
            <div key={point.createdAt} className="flex flex-1 flex-col items-center gap-2">
              <div
                aria-label={t('trend_point_label', {
                  date: new Date(point.createdAt).toLocaleDateString(),
                  score: point.score,
                })}
                className="w-full rounded-t-md bg-blue-500"
                style={{ height: `${Math.max(point.score, 6)}%` }}
              />
              <span className="text-[11px] text-slate-500">{point.score}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
