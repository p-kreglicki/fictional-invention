'use client';

import type { ExerciseGenerationJobStatus } from './GenerationJobStatus';
import type { DocumentListItem } from '@/validations/DocumentValidation';
import type {
  ExerciseLatestResponse,
  ExercisesDashboardResponse,
  ExerciseSet,
} from '@/validations/ResponseValidation';
import { ArrowRight } from '@untitledui/icons';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { DeleteExerciseSetDialog } from '@/components/exercises/DeleteExerciseSetDialog';
import { ExerciseSetAccordion } from '@/components/exercises/ExerciseSetAccordion';
import { createPollingGate } from '@/components/exercises/PollingGate';
import { buttonStyles, panelStyles } from '@/components/ui/styles';
import { Link } from '@/libs/I18nNavigation';
import { DocumentListItemSchema } from '@/validations/DocumentValidation';
import {
  ExercisesDashboardResponseSchema,
  ExerciseSetSchema,
  SubmitResponseSuccessSchema,
} from '@/validations/ResponseValidation';
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

function mergeSets(current: ExerciseSet[], incoming: ExerciseSet[]) {
  const map = new Map<string, ExerciseSet>();

  for (const set of current) {
    map.set(set.id, set);
  }

  for (const set of incoming) {
    map.set(set.id, set);
  }

  return [...map.values()].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

function toJobSummary(set: ExerciseSet): ExerciseGenerationJobStatus {
  return {
    id: set.id,
    status: set.status,
    requestedCount: set.requestedCount,
    generatedCount: set.generatedCount,
    failedCount: set.failedCount,
    errorMessage: set.errorMessage,
    exerciseType: set.exerciseType,
    difficulty: set.difficulty,
    topicFocus: set.topicFocus,
    createdAt: set.createdAt,
    startedAt: set.startedAt,
    completedAt: set.completedAt,
  };
}

function findExerciseInDashboardPayload(input: {
  exerciseId: string;
  payload: ExercisesDashboardResponse;
}) {
  for (const set of input.payload.sets) {
    const exercise = set.exercises.find(candidate => candidate.id === input.exerciseId);
    if (exercise) {
      return exercise;
    }
  }

  return null;
}

async function parseOptionalJsonResponse<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return null;
  }

  try {
    return await response.json() as T;
  } catch {
    return null;
  }
}

export function ExercisesDashboard() {
  const locale = useLocale();
  const t = useTranslations('DashboardExercisesPage');
  const apiBasePath = `/${locale}/api`;
  const pollingGateRef = useRef(createPollingGate());
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeletingSet, setIsDeletingSet] = useState(false);
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [jobs, setJobs] = useState<ExerciseGenerationJobStatus[]>([]);
  const [sets, setSets] = useState<ExerciseSet[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteSetErrorMessage, setDeleteSetErrorMessage] = useState<string | null>(null);
  const [setToDelete, setSetToDelete] = useState<ExerciseSet | null>(null);

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
        const exercisesPayload = ExercisesDashboardResponseSchema.safeParse(await exercisesResponse.json() as unknown);

        if (!documentsPayload.success || !exercisesPayload.success) {
          throw new Error('documents_invalid');
        }

        if (!active) {
          return;
        }

        setDocuments(documentsPayload.data.documents);
        setSets(exercisesPayload.data.sets);
        setJobs(exercisesPayload.data.activeJobs);
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

          const payload = ExerciseSetSchema.safeParse(await response.json() as unknown);
          return payload.success ? payload.data : null;
        }));

        if (!active) {
          return;
        }

        const nextSets = results.filter((result): result is ExerciseSet => {
          return Boolean(result);
        });
        const visibleSets = nextSets.filter(set => set.exercises.length > 0);

        setJobs((current) => {
          const merged = mergeJobs(current, nextSets.map(toJobSummary));
          const visibleSetIds = new Set(visibleSets.map(set => set.id));

          return merged.filter(job => !visibleSetIds.has(job.id));
        });

        if (visibleSets.length > 0) {
          setSets((current) => {
            return mergeSets(current, visibleSets);
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
          exerciseType: request.exerciseType,
          difficulty: request.difficulty ?? null,
          topicFocus: request.topicFocus ?? null,
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
    setSets((current) => {
      return current.map((set) => {
        let didUpdate = false;
        const exercises = set.exercises.map((exercise) => {
          if (exercise.id !== input.exerciseId) {
            return exercise;
          }

          didUpdate = true;
          return {
            ...exercise,
            latestResponse: input.latestResponse,
            timesAttempted: input.timesAttempted,
            averageScore: input.averageScore,
          };
        });

        return didUpdate
          ? {
              ...set,
              exercises,
            }
          : set;
      });
    });
  }

  async function handleExerciseSyncRequested(exerciseId: string) {
    try {
      const response = await fetch(`${apiBasePath}/exercises`);
      if (!response.ok) {
        return null;
      }

      const parsedPayload = ExercisesDashboardResponseSchema.safeParse(await response.json() as unknown);
      if (!parsedPayload.success) {
        return null;
      }

      const matchedExercise = findExerciseInDashboardPayload({
        exerciseId,
        payload: parsedPayload.data,
      });
      if (!matchedExercise?.latestResponse) {
        return null;
      }

      setSets(current => mergeSets(current, parsedPayload.data.sets));
      setJobs(parsedPayload.data.activeJobs);

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

  async function handleDeleteSetConfirm() {
    if (!setToDelete) {
      return;
    }

    setIsDeletingSet(true);
    setDeleteSetErrorMessage(null);

    try {
      const response = await fetch(`${apiBasePath}/exercises/jobs/${setToDelete.id}`, {
        method: 'DELETE',
      });
      const payload = await parseOptionalJsonResponse<{ error?: string; message?: string }>(response);

      if (!response.ok) {
        throw new Error(payload?.message ?? payload?.error ?? t('delete_set_error'));
      }

      setSets(current => current.filter(set => set.id !== setToDelete.id));
      setJobs(current => current.filter(job => job.id !== setToDelete.id));
      setSetToDelete(null);
    } catch (error) {
      setDeleteSetErrorMessage(error instanceof Error ? error.message : t('delete_set_error'));
    } finally {
      setIsDeletingSet(false);
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
      <header className="flex flex-col gap-5">
        <div className="max-w-5xl">
          <h1 className="text-3xl font-semibold text-ink-950 sm:text-4xl">{t('title')}</h1>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-ink-600 sm:text-base">{t('description')}</p>
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

      {readyDocuments.length > 0 && processingDocumentsCount > 0 && (
        <section className={panelStyles({ tone: 'muted', className: 'text-sm text-ink-600' })}>
          <p>{t('state_partial_processing', { count: processingDocumentsCount })}</p>
        </section>
      )}

      <ExerciseGeneratorForm
        documents={readyDocuments}
        isSubmitting={isSubmitting}
        onSubmit={handleGenerate}
        serverError={errorMessage}
      />

      <GenerationJobStatus jobs={jobs} />

      <ExerciseSetAccordion
        apiBasePath={apiBasePath}
        onDeleteRequest={(set) => {
          setDeleteSetErrorMessage(null);
          setSetToDelete(set);
        }}
        onExerciseSyncRequested={handleExerciseSyncRequested}
        onExerciseUpdated={handleExerciseUpdated}
        sets={sets}
      />

      <DeleteExerciseSetDialog
        errorMessage={deleteSetErrorMessage}
        isDeleting={isDeletingSet}
        onCancel={() => {
          if (isDeletingSet) {
            return;
          }

          setSetToDelete(null);
          setDeleteSetErrorMessage(null);
        }}
        onConfirm={handleDeleteSetConfirm}
        setToDelete={setToDelete}
      />
    </div>
  );
}
