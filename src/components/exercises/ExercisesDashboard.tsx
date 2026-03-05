'use client';

import type { ExerciseCardItem } from './ExerciseCards';
import type { ExerciseGenerationJobStatus } from './GenerationJobStatus';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPollingGate } from '@/components/exercises/PollingGate';
import { ExerciseCards } from './ExerciseCards';
import { ExerciseGeneratorForm } from './ExerciseGeneratorForm';
import { GenerationJobStatus } from './GenerationJobStatus';

type ReadyDocument = {
  id: string;
  title: string;
  contentType: 'pdf' | 'url' | 'text';
  status: 'uploading' | 'processing' | 'ready' | 'failed';
};

type GenerateRequest = {
  documentIds: string[];
  exerciseType: 'multiple_choice' | 'fill_gap' | 'single_answer';
  count: number;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  topicFocus?: string;
};

function mergeExercises(current: ExerciseCardItem[], incoming: ExerciseCardItem[]) {
  const map = new Map<string, ExerciseCardItem>();

  for (const exercise of current) {
    map.set(exercise.id, exercise);
  }

  for (const exercise of incoming) {
    map.set(exercise.id, exercise);
  }

  return [...map.values()].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function mergeJobs(current: ExerciseGenerationJobStatus[], incoming: ExerciseGenerationJobStatus[]) {
  const map = new Map<string, ExerciseGenerationJobStatus>();

  for (const job of current) {
    map.set(job.id, job);
  }

  for (const job of incoming) {
    map.set(job.id, job);
  }

  return [...map.values()].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function ExercisesDashboard() {
  const locale = useLocale();
  const t = useTranslations('DashboardExercisesPage');
  const apiBasePath = `/${locale}/api`;
  const pollingGateRef = useRef(createPollingGate());
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [documents, setDocuments] = useState<ReadyDocument[]>([]);
  const [jobs, setJobs] = useState<ExerciseGenerationJobStatus[]>([]);
  const [exercises, setExercises] = useState<ExerciseCardItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const [documentsResponse, exercisesResponse] = await Promise.all([
          fetch(`${apiBasePath}/documents`),
          fetch(`${apiBasePath}/exercises`),
        ]);

        if (!documentsResponse.ok || !exercisesResponse.ok) {
          throw new Error('bootstrap_failed');
        }

        const documentsPayload = await documentsResponse.json() as { documents: ReadyDocument[] };
        const exercisesPayload = await exercisesResponse.json() as {
          exercises: ExerciseCardItem[];
          activeJobs: ExerciseGenerationJobStatus[];
        };

        if (!active) {
          return;
        }

        setDocuments(documentsPayload.documents.filter(document => document.status === 'ready'));
        setExercises(exercisesPayload.exercises);
        setJobs(exercisesPayload.activeJobs);
      } catch {
        if (!active) {
          return;
        }
        setErrorMessage(t('bootstrap_error'));
      } finally {
        if (active) {
          setIsBootstrapping(false);
        }
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [apiBasePath, t]);

  const activeJobs = useMemo(() => {
    return jobs.filter(job => job.status === 'pending' || job.status === 'processing');
  }, [jobs]);

  useEffect(() => {
    if (activeJobs.length === 0) {
      return undefined;
    }

    let active = true;

    async function pollActiveJobs() {
      if (!active || !pollingGateRef.current.tryEnter()) {
        return;
      }

      try {
        const results = await Promise.all(activeJobs.map(async (job) => {
          const response = await fetch(`${apiBasePath}/exercises/jobs/${job.id}`);
          if (!response.ok) {
            return null;
          }

          return response.json() as Promise<ExerciseGenerationJobStatus & {
            exercises: ExerciseCardItem[];
          }>;
        }));

        if (!active) {
          return;
        }

        const filtered = results.filter((result): result is ExerciseGenerationJobStatus & { exercises: ExerciseCardItem[] } => {
          return Boolean(result);
        });

        setJobs((current) => {
          return mergeJobs(current, filtered.map(job => ({
            id: job.id,
            status: job.status,
            requestedCount: job.requestedCount,
            generatedCount: job.generatedCount,
            failedCount: job.failedCount,
            errorMessage: job.errorMessage,
            createdAt: job.createdAt,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
          })));
        });

        const exerciseResults = filtered.flatMap(job => job.exercises);
        if (exerciseResults.length > 0) {
          setExercises((current) => {
            return mergeExercises(current, exerciseResults);
          });
        }
      } catch {
        if (!active) {
          return;
        }
        setErrorMessage(t('polling_error'));
      } finally {
        pollingGateRef.current.leave();
      }
    }

    const interval = window.setInterval(() => {
      void pollActiveJobs();
    }, 2000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [activeJobs, apiBasePath, t]);

  async function handleGenerate(request: GenerateRequest) {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${apiBasePath}/exercises/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      const payload = await response.json() as {
        error?: string;
        message?: string;
        jobId?: string;
        status?: ExerciseGenerationJobStatus['status'];
      };

      if (!response.ok || !payload.jobId) {
        throw new Error(payload.message ?? payload.error ?? 'generation_failed');
      }

      const now = new Date().toISOString();
      setJobs((current) => {
        return mergeJobs(current, [{
          id: payload.jobId as string,
          status: payload.status ?? 'pending',
          requestedCount: request.count,
          generatedCount: 0,
          failedCount: 0,
          errorMessage: null,
          createdAt: now,
          startedAt: null,
          completedAt: null,
        }]);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('generation_error');
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isBootstrapping) {
    return <p className="text-sm text-gray-600">{t('loading')}</p>;
  }

  return (
    <div className="space-y-6 py-5">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-gray-900">{t('title')}</h1>
        <p className="text-sm text-gray-600">{t('description')}</p>
      </header>

      <ExerciseGeneratorForm
        documents={documents}
        isSubmitting={isSubmitting}
        onSubmit={handleGenerate}
        serverError={errorMessage}
      />

      <GenerationJobStatus jobs={jobs} />
      <ExerciseCards exercises={exercises} />
    </div>
  );
}
