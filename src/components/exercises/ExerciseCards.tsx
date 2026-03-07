'use client';

import type {
  ExerciseCard as ExerciseCardItem,
  ExerciseLatestResponse,
  SubmitResponseSuccess,
} from '@/validations/ResponseValidation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { SubmissionDraftsSchema, SubmitResponseSuccessSchema } from '@/validations/ResponseValidation';

type ExerciseCardsProps = {
  exercises: ExerciseCardItem[];
  apiBasePath: string;
  onExerciseUpdated: (input: {
    exerciseId: string;
    latestResponse: ExerciseLatestResponse;
    timesAttempted: number;
    averageScore: number | null;
  }) => void;
  onExerciseSyncRequested?: (exerciseId: string) => Promise<SubmitResponseSuccess | null>;
};

type SubmissionState = {
  isSubmitting: boolean;
  errorMessage: string | null;
};

type SubmissionDraft = {
  answerKey: string;
  clientSubmissionId: string;
};

const submissionDraftsStorageKey = 'exercise-submission-drafts';

function buildAnswerKey(answer: string | number) {
  return `${typeof answer}:${String(answer)}`;
}

function readSubmissionDrafts() {
  if (typeof window === 'undefined') {
    return {} as Record<string, SubmissionDraft>;
  }

  try {
    const raw = window.sessionStorage.getItem(submissionDraftsStorageKey);
    if (!raw) {
      return {} as Record<string, SubmissionDraft>;
    }

    const parsed = SubmissionDraftsSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return {} as Record<string, SubmissionDraft>;
    }

    return parsed.data;
  } catch {
    return {} as Record<string, SubmissionDraft>;
  }
}

function writeSubmissionDrafts(value: Record<string, SubmissionDraft>) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(submissionDraftsStorageKey, JSON.stringify(value));
  } catch {
    // Ignore storage failures and fall back to in-memory request protection.
  }
}

function loadSubmissionDraft(exerciseId: string) {
  return readSubmissionDrafts()[exerciseId] ?? null;
}

function persistSubmissionDraft(exerciseId: string, draft: SubmissionDraft) {
  const drafts = readSubmissionDrafts();
  writeSubmissionDrafts({
    ...drafts,
    [exerciseId]: draft,
  });
}

function clearSubmissionDraft(exerciseId: string) {
  const drafts = readSubmissionDrafts();
  if (!(exerciseId in drafts)) {
    return;
  }

  const nextDrafts = { ...drafts };
  delete nextDrafts[exerciseId];
  writeSubmissionDrafts(nextDrafts);
}

function getExerciseTypeLabel(input: {
  exercise: ExerciseCardItem;
  t: ReturnType<typeof useTranslations>;
}) {
  switch (input.exercise.type) {
    case 'multiple_choice':
      return input.t('exercise_type_multiple_choice');
    case 'fill_gap':
      return input.t('exercise_type_fill_gap');
    case 'single_answer':
      return input.t('exercise_type_single_answer');
  }
}

function getDifficultyLabel(input: {
  difficulty: ExerciseCardItem['difficulty'];
  t: ReturnType<typeof useTranslations>;
}) {
  switch (input.difficulty) {
    case 'beginner':
      return input.t('difficulty_beginner');
    case 'intermediate':
      return input.t('difficulty_intermediate');
    case 'advanced':
      return input.t('difficulty_advanced');
    default:
      return null;
  }
}

function getSubmissionErrorMessage(input: {
  error: unknown;
  t: ReturnType<typeof useTranslations>;
}) {
  if (!(input.error instanceof Error)) {
    return input.t('submission_failed');
  }

  return input.error.message || input.t('submission_failed');
}

function getAnswerPayload(input: {
  answerValue: string | undefined;
  exercise: ExerciseCardItem;
}) {
  if (input.exercise.type === 'multiple_choice') {
    if (!input.answerValue || !/^\d+$/.test(input.answerValue)) {
      return null;
    }

    return Number(input.answerValue);
  }

  const answer = input.answerValue?.trim();
  if (!answer) {
    return null;
  }

  return answer;
}

function renderRubric(props: {
  response: ExerciseLatestResponse;
  labels: {
    accuracy: string;
    grammar: string;
    fluency: string;
    bonus: string;
  };
}) {
  return (
    <dl className="grid grid-cols-2 gap-2 text-xs text-gray-600 sm:grid-cols-4">
      <div className="rounded-md bg-gray-50 p-2">
        <dt>{props.labels.accuracy}</dt>
        <dd className="mt-1 font-semibold text-gray-900">
          {props.response.rubric.accuracy}
          /40
        </dd>
      </div>
      <div className="rounded-md bg-gray-50 p-2">
        <dt>{props.labels.grammar}</dt>
        <dd className="mt-1 font-semibold text-gray-900">
          {props.response.rubric.grammar}
          /30
        </dd>
      </div>
      <div className="rounded-md bg-gray-50 p-2">
        <dt>{props.labels.fluency}</dt>
        <dd className="mt-1 font-semibold text-gray-900">
          {props.response.rubric.fluency}
          /20
        </dd>
      </div>
      <div className="rounded-md bg-gray-50 p-2">
        <dt>{props.labels.bonus}</dt>
        <dd className="mt-1 font-semibold text-gray-900">
          {props.response.rubric.bonus}
          /10
        </dd>
      </div>
    </dl>
  );
}

export { type ExerciseCardItem };

export function ExerciseCards(props: ExerciseCardsProps) {
  const t = useTranslations('DashboardExercisesPage');
  const rubricLabels = {
    accuracy: t('rubric_accuracy'),
    grammar: t('rubric_grammar'),
    fluency: t('rubric_fluency'),
    bonus: t('rubric_bonus'),
  };
  const [answersByExerciseId, setAnswersByExerciseId] = useState<Record<string, string>>({});
  const [submissionStateByExerciseId, setSubmissionStateByExerciseId] = useState<Record<string, SubmissionState>>({});
  const isMountedRef = useRef(true);
  const requestIdByExerciseIdRef = useRef<Record<string, number>>({});

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  function isLatestRequest(exerciseId: string, requestId: number) {
    return requestIdByExerciseIdRef.current[exerciseId] === requestId;
  }

  function applySubmissionResult(input: {
    exerciseId: string;
    payload: SubmitResponseSuccess;
  }) {
    props.onExerciseUpdated({
      exerciseId: input.exerciseId,
      latestResponse: input.payload.response,
      timesAttempted: input.payload.exerciseStats.timesAttempted,
      averageScore: input.payload.exerciseStats.averageScore,
    });
  }

  function setSubmissionIdle(input: {
    exerciseId: string;
    requestId: number;
    errorMessage: string | null;
  }) {
    if (!isMountedRef.current || !isLatestRequest(input.exerciseId, input.requestId)) {
      return;
    }

    setSubmissionStateByExerciseId(current => ({
      ...current,
      [input.exerciseId]: {
        isSubmitting: false,
        errorMessage: input.errorMessage,
      },
    }));
  }

  async function handleSubmit(exercise: ExerciseCardItem) {
    const currentState = submissionStateByExerciseId[exercise.id];
    if (currentState?.isSubmitting) {
      return;
    }

    const answer = getAnswerPayload({
      answerValue: answersByExerciseId[exercise.id],
      exercise,
    });

    if (answer === null) {
      setSubmissionStateByExerciseId(current => ({
        ...current,
        [exercise.id]: {
          isSubmitting: false,
          errorMessage: t('submission_validation_error'),
        },
      }));
      return;
    }

    const answerKey = buildAnswerKey(answer);
    const existingDraft = loadSubmissionDraft(exercise.id);
    const clientSubmissionId = existingDraft?.answerKey === answerKey
      ? existingDraft.clientSubmissionId
      : crypto.randomUUID();

    persistSubmissionDraft(exercise.id, {
      answerKey,
      clientSubmissionId,
    });

    const requestId = (requestIdByExerciseIdRef.current[exercise.id] ?? 0) + 1;
    requestIdByExerciseIdRef.current[exercise.id] = requestId;

    setSubmissionStateByExerciseId(current => ({
      ...current,
      [exercise.id]: {
        isSubmitting: true,
        errorMessage: null,
      },
    }));

    try {
      const response = await fetch(`${props.apiBasePath}/responses/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          exerciseId: exercise.id,
          answer,
          clientSubmissionId,
        }),
      });

      const payload = await response.json() as {
        error?: string;
        message?: string;
      };
      const parsedPayload = SubmitResponseSuccessSchema.safeParse(payload);

      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? t('submission_failed'));
      }

      if (!parsedPayload.success) {
        const refreshedPayload = await props.onExerciseSyncRequested?.(exercise.id) ?? null;
        if (!refreshedPayload) {
          throw new Error(t('submission_failed'));
        }

        if (!isMountedRef.current || !isLatestRequest(exercise.id, requestId)) {
          return;
        }

        applySubmissionResult({
          exerciseId: exercise.id,
          payload: refreshedPayload,
        });
        clearSubmissionDraft(exercise.id);
        setSubmissionIdle({
          exerciseId: exercise.id,
          requestId,
          errorMessage: null,
        });
        return;
      }

      if (!isMountedRef.current || !isLatestRequest(exercise.id, requestId)) {
        return;
      }

      applySubmissionResult({
        exerciseId: exercise.id,
        payload: parsedPayload.data,
      });
      clearSubmissionDraft(exercise.id);

      setSubmissionIdle({
        exerciseId: exercise.id,
        requestId,
        errorMessage: null,
      });
    } catch (error) {
      setSubmissionIdle({
        exerciseId: exercise.id,
        requestId,
        errorMessage: getSubmissionErrorMessage({ error, t }),
      });
    }
  }

  if (props.exercises.length === 0) {
    return (
      <section className="rounded-md border border-gray-200 bg-white p-4">
        <h2 className="text-base font-semibold text-gray-900">{t('results_title')}</h2>
        <p className="mt-2 text-sm text-gray-600">{t('results_empty')}</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900">{t('results_title')}</h2>

      <div className="grid gap-4 md:grid-cols-2">
        {props.exercises.map((exercise) => {
          const submissionState = submissionStateByExerciseId[exercise.id];
          const exerciseTypeLabel = exercise.type === 'multiple_choice'
            ? null
            : getExerciseTypeLabel({ exercise, t });
          const difficultyLabel = getDifficultyLabel({
            difficulty: exercise.difficulty,
            t,
          });
          const metadataLabels = [exerciseTypeLabel, difficultyLabel].filter(
            (label): label is string => label !== null,
          );

          return (
            <article key={exercise.id} className="rounded-md border border-gray-200 bg-white p-4">
              {metadataLabels.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs tracking-wide text-gray-500 uppercase">
                  {metadataLabels.map((label, index) => (
                    <span key={`${exercise.id}-${label}`}>
                      {index > 0 && <span aria-hidden="true" className="mr-2">•</span>}
                      {label}
                    </span>
                  ))}
                </div>
              )}

              <h3 className="mt-2 text-sm font-semibold text-gray-900">{exercise.question}</h3>

              {exercise.grammarFocus && (
                <p className="mt-2 text-xs text-gray-600">
                  {t('grammar_focus_label')}
                  :
                  {' '}
                  {exercise.grammarFocus}
                </p>
              )}

              {exercise.type === 'multiple_choice' && (
                <fieldset className="mt-3 space-y-3">
                  <legend className="text-sm text-gray-700">{t('choose_correct_answer_label')}</legend>
                  {exercise.renderData.options.map((option, index, options) => {
                    const duplicateCount = options
                      .slice(0, index)
                      .filter(existingOption => existingOption === option)
                      .length;

                    return (
                      <label
                        key={`${exercise.id}-${option}-${duplicateCount}`}
                        className="flex cursor-pointer items-center gap-3 py-1 text-sm text-gray-700"
                      >
                        <input
                          className="h-4 w-4 shrink-0 border-gray-300 text-gray-900"
                          type="radio"
                          name={`exercise-${exercise.id}`}
                          value={String(index)}
                          checked={answersByExerciseId[exercise.id] === String(index)}
                          disabled={submissionState?.isSubmitting}
                          onChange={(event) => {
                            clearSubmissionDraft(exercise.id);
                            setAnswersByExerciseId(current => ({
                              ...current,
                              [exercise.id]: event.target.value,
                            }));
                          }}
                        />
                        <span>{option}</span>
                      </label>
                    );
                  })}
                </fieldset>
              )}

              {exercise.type === 'fill_gap' && (
                <div className="mt-3 space-y-2">
                  {exercise.renderData.hint && (
                    <p className="text-xs text-gray-600">
                      {t('hint_label')}
                      :
                      {' '}
                      {exercise.renderData.hint}
                    </p>
                  )}
                  <label className="block text-sm text-gray-700" htmlFor={`answer-${exercise.id}`}>
                    {t('answer_input_label')}
                  </label>
                  <input
                    id={`answer-${exercise.id}`}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    value={answersByExerciseId[exercise.id] ?? ''}
                    disabled={submissionState?.isSubmitting}
                    onChange={(event) => {
                      clearSubmissionDraft(exercise.id);
                      setAnswersByExerciseId(current => ({
                        ...current,
                        [exercise.id]: event.target.value,
                      }));
                    }}
                    placeholder={t('fill_gap_placeholder')}
                  />
                </div>
              )}

              {exercise.type === 'single_answer' && (
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-sm text-gray-700">{t('grading_criteria_label')}</p>
                    <ul className="mt-2 list-inside list-disc text-sm text-gray-600">
                      {exercise.renderData.gradingCriteria.map(item => (
                        <li key={`${exercise.id}-${item}`}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-700" htmlFor={`answer-${exercise.id}`}>
                      {t('answer_input_label')}
                    </label>
                    <textarea
                      id={`answer-${exercise.id}`}
                      className="mt-2 min-h-28 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
                      value={answersByExerciseId[exercise.id] ?? ''}
                      disabled={submissionState?.isSubmitting}
                      onChange={(event) => {
                        clearSubmissionDraft(exercise.id);
                        setAnswersByExerciseId(current => ({
                          ...current,
                          [exercise.id]: event.target.value,
                        }));
                      }}
                      placeholder={t('single_answer_placeholder')}
                    />
                  </div>
                </div>
              )}

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-400"
                  disabled={submissionState?.isSubmitting}
                  onClick={() => {
                    void handleSubmit(exercise);
                  }}
                >
                  {submissionState?.isSubmitting
                    ? t('submit_answer_loading')
                    : t('submit_answer_button')}
                </button>

                {submissionState?.errorMessage && (
                  <p className="text-sm text-red-600">{submissionState.errorMessage}</p>
                )}
              </div>

              {exercise.latestResponse && (
                <section className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-gray-900">{t('latest_response_label')}</h4>
                    <p className="text-sm font-semibold text-gray-900">
                      {t('score_label')}
                      :
                      {' '}
                      {exercise.latestResponse.score}
                      /100
                    </p>
                  </div>

                  <div className="mt-3">
                    {renderRubric({
                      response: exercise.latestResponse,
                      labels: rubricLabels,
                    })}
                  </div>

                  <p className="mt-3 text-sm text-gray-700">
                    <span className="font-medium text-gray-900">{t('feedback_label')}</span>
                    :
                    {' '}
                    {exercise.latestResponse.overallFeedback}
                  </p>

                  {exercise.latestResponse.suggestedReview.length > 0 && (
                    <p className="mt-2 text-sm text-gray-700">
                      <span className="font-medium text-gray-900">{t('suggested_review_label')}</span>
                      :
                      {' '}
                      {exercise.latestResponse.suggestedReview.join(', ')}
                    </p>
                  )}
                </section>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
