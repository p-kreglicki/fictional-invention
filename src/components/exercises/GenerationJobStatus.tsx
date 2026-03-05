'use client';

import { useTranslations } from 'next-intl';

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

function statusLabelKey(status: JobStatus) {
  if (status === 'pending') {
    return 'job_status_pending';
  }

  if (status === 'processing') {
    return 'job_status_processing';
  }

  if (status === 'completed') {
    return 'job_status_completed';
  }

  return 'job_status_failed';
}

export function GenerationJobStatus(props: GenerationJobStatusProps) {
  const t = useTranslations('DashboardExercisesPage');

  if (props.jobs.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3 rounded-md border border-gray-200 bg-gray-50 p-4">
      <h2 className="text-base font-semibold text-gray-900">{t('jobs_title')}</h2>

      <ul className="space-y-2">
        {props.jobs.map(job => (
          <li key={job.id} className="rounded-sm border border-gray-200 bg-white p-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="font-medium text-gray-900">{t(statusLabelKey(job.status))}</span>
              <span className="text-gray-600">
                {job.generatedCount}
                /
                {job.requestedCount}
              </span>
            </div>
            <p className="mt-1 text-gray-600">
              {t('job_failed_count')}
              :
              {' '}
              {job.failedCount}
            </p>
            {job.errorMessage && (
              <p className="mt-1 text-red-600">{job.errorMessage}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
