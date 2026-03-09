'use client';

import type { ExerciseCardItem } from './ExerciseCards';
import type { ExerciseGenerationJobStatus } from './GenerationJobStatus';
import type { DocumentListItem } from '@/validations/DocumentValidation';
import type { ExerciseLatestResponse } from '@/validations/ResponseValidation';
import { ArrowRight, FileSearch03, TrendUp02 } from '@untitledui/icons';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { createPollingGate } from '@/components/exercises/PollingGate';
import { badgeStyles, buttonStyles, panelStyles } from '@/components/ui/styles';
import { Link } from '@/libs/I18nNavigation';
import { DocumentListItemSchema } from '@/validations/DocumentValidation';
import { ExerciseCardSchema, SubmitResponseSuccessSchema } from '@/validations/ResponseValidation';
import { ExerciseCards } from './ExerciseCards';
import { ExerciseGeneratorForm } from './ExerciseGeneratorForm';
import { GenerationJobStatus } from './GenerationJobStatus';

type GenerateRequest = {
  documentIds: string[];
  exerciseType: 'multiple_choice' | 'fill_gap' | 'single_answer';
  count: number;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  topicFocus?: string;
};

const DocumentsResponseSchema = z.object({
  documents: z.array(DocumentListItemSchema),
});

const ExercisesSyncResponseSchema = z.object({
  exercises: z.array(ExerciseCardSchema),
});

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
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
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

        const documentsPayload = DocumentsResponseSchema.safeParse(await documentsResponse.json() as unknown);
        const exercisesPayload = await exercisesResponse.json() as {
          exercises: ExerciseCardItem[];
          activeJobs: ExerciseGenerationJobStatus[];
        };

        if (!documentsPayload.success) {
          throw new Error('documents_invalid');
        }

        if (!active) {
          return;
        }

        setDocuments(documentsPayload.data.documents);
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

  const readyDocuments = useMemo(() => {
    return documents.filter(document => document.status === 'ready');
  }, [documents]);

  const processingDocumentsCount = useMemo(() => {
    return documents.filter(document => document.status === 'uploading' || document.status === 'processing').length;
  }, [documents]);

  const failedDocumentsCount = useMemo(() => {
    return documents.filter(document => document.status === 'failed').length;
  }, [documents]);

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

  function handleExerciseUpdated(input: {
    exerciseId: string;
    latestResponse: ExerciseLatestResponse;
    timesAttempted: number;
    averageScore: number | null;
  }) {
    setExercises(current => current.map((exercise) => {
      if (exercise.id !== input.exerciseId) {
        return exercise;
      }

      return {
        ...exercise,
        latestResponse: input.latestResponse,
        timesAttempted: input.timesAttempted,
        averageScore: input.averageScore,
      };
    }));
  }

  async function handleExerciseSyncRequested(exerciseId: string) {
    try {
      const response = await fetch(`${apiBasePath}/exercises`);
      if (!response.ok) {
        return null;
      }

      const parsedPayload = ExercisesSyncResponseSchema.safeParse(await response.json() as unknown);
      if (!parsedPayload.success) {
        return null;
      }

      const matchedExercise = parsedPayload.data.exercises.find(exercise => exercise.id === exerciseId);
      if (!matchedExercise?.latestResponse) {
        return null;
      }

      setExercises(current => mergeExercises(current, [matchedExercise]));

      return SubmitResponseSuccessSchema.parse({
        response: matchedExercise.latestResponse,
        exerciseStats: {
          timesAttempted: matchedExercise.timesAttempted,
          averageScore: matchedExercise.averageScore,
        },
      });
    } catch {
      return null;
    }
  }

  if (isBootstrapping) {
    return <section className={panelStyles({ className: 'text-sm text-ink-600' })}>{t('loading')}</section>;
  }

  const showNoDocumentsState = documents.length === 0;
  const showProcessingState = readyDocuments.length === 0 && processingDocumentsCount > 0;
  const showFailedState = readyDocuments.length === 0 && failedDocumentsCount > 0 && processingDocumentsCount === 0;

  return (
    <div className="space-y-6 py-5">
      <header className={panelStyles({ tone: 'strong' })}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <span className={badgeStyles({ tone: 'brand', uppercase: true })}>{t('jobs_title')}</span>
            <h1 className="mt-4 text-3xl font-semibold text-ink-950 sm:text-4xl">{t('title')}</h1>
            <p className="mt-3 text-sm leading-7 text-ink-600">{t('description')}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-[1.5rem] border border-white/90 bg-white/80 p-4 shadow-xs">
              <TrendUp02 className="h-5 w-5 text-brand-600" />
              <p className="mt-4 text-xs font-semibold tracking-[0.18em] text-ink-500 uppercase">{t('results_title')}</p>
            </article>
            <article className="rounded-[1.5rem] border border-white/90 bg-white/80 p-4 shadow-xs">
              <FileSearch03 className="h-5 w-5 text-brand-600" />
              <p className="mt-4 text-xs font-semibold tracking-[0.18em] text-ink-500 uppercase">{t('documents_label')}</p>
            </article>
          </div>
        </div>
      </header>

      {(showNoDocumentsState || showProcessingState || showFailedState) && (
        <section className={panelStyles({ tone: 'muted' })}>
          <h2 className="text-base font-semibold text-ink-950">
            {showNoDocumentsState
              ? t('state_no_documents_title')
              : showProcessingState
                ? t('state_processing_title')
                : t('state_failed_title')}
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-600">
            {showNoDocumentsState
              ? t('state_no_documents_description')
              : showProcessingState
                ? t('state_processing_description', { count: processingDocumentsCount })
                : t('state_failed_description', { count: failedDocumentsCount })}
          </p>
          <Link
            href="/dashboard/content/"
            className={`mt-4 ${buttonStyles({ tone: 'primary' })}`}
          >
            {t('state_content_cta')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      )}

      {readyDocuments.length > 0 && (processingDocumentsCount > 0 || failedDocumentsCount > 0) && (
        <section className={panelStyles({ tone: 'muted', className: 'text-sm text-ink-600' })}>
          {processingDocumentsCount > 0 && (
            <p>{t('state_partial_processing', { count: processingDocumentsCount })}</p>
          )}
          {failedDocumentsCount > 0 && (
            <p>{t('state_partial_failed', { count: failedDocumentsCount })}</p>
          )}
        </section>
      )}

      <ExerciseGeneratorForm
        documents={readyDocuments}
        isSubmitting={isSubmitting}
        onSubmit={handleGenerate}
        serverError={errorMessage}
      />

      <GenerationJobStatus jobs={jobs} />
      <ExerciseCards
        exercises={exercises}
        apiBasePath={apiBasePath}
        onExerciseUpdated={handleExerciseUpdated}
        onExerciseSyncRequested={handleExerciseSyncRequested}
      />
    </div>
  );
}
