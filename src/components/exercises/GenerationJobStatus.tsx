'use client';

import { useTranslations } from 'next-intl';
import { badgeStyles, panelStyles } from '@/components/ui/styles';

type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type ExerciseGenerationJobStatus = {
  id: string;
  status: JobStatus;
  requestedCount: number;
  generatedCount: number;
  failedCount: number;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

type GenerationJobStatusProps = {
  jobs: ExerciseGenerationJobStatus[];
};

function statusLabel(t: ReturnType<typeof useTranslations<'DashboardExercisesPage'>>, status: JobStatus) {
  if (status === 'pending') {
    return t('job_status_pending');
  }

  if (status === 'processing') {
    return t('job_status_processing');
  }

  if (status === 'completed') {
    return t('job_status_completed');
  }

  return t('job_status_failed');
}

export function GenerationJobStatus(props: GenerationJobStatusProps) {
  const t = useTranslations('DashboardExercisesPage');

  if (props.jobs.length === 0) {
    return null;
  }

  return (
    <section className={panelStyles({ tone: 'muted', className: 'space-y-3' })}>
      <h2 className="text-base font-semibold text-ink-900">{t('jobs_title')}</h2>

      <ul className="space-y-2">
        {props.jobs.map(job => (
          <li key={job.id} className="rounded-[1.25rem] border border-white/85 bg-white p-4 text-sm shadow-xs">
            <div className="flex items-center justify-between gap-4">
              <span className={badgeStyles({ tone: job.status === 'failed' ? 'danger' : job.status === 'completed' ? 'success' : 'warning' })}>
                {statusLabel(t, job.status)}
              </span>
              <span className="text-ink-600">
                {job.generatedCount}
                /
                {job.requestedCount}
              </span>
            </div>
            <p className="mt-2 text-ink-600">
              {t('job_failed_count')}
              :
              {' '}
              {job.failedCount}
            </p>
            {job.errorMessage && (
              <p className="mt-2 rounded-2xl border border-error-100 bg-error-50 px-3 py-2 text-error-700">{job.errorMessage}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
