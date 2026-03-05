'use client';

import { useTranslations } from 'next-intl';

export type ExerciseCardItem = {
  id: string;
  type: 'multiple_choice' | 'fill_gap' | 'single_answer';
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  question: string;
  exerciseData: unknown;
  sourceChunkIds: string[];
  grammarFocus: string | null;
  createdAt: string;
};

type ExerciseCardsProps = {
  exercises: ExerciseCardItem[];
};

function parseMultipleChoiceData(value: unknown) {
  if (typeof value !== 'object' || !value) {
    return null;
  }

  if (!('options' in value) || !('correctIndex' in value)) {
    return null;
  }

  if (!Array.isArray(value.options) || typeof value.correctIndex !== 'number') {
    return null;
  }

  return {
    options: value.options.filter(option => typeof option === 'string') as string[],
    correctIndex: value.correctIndex,
  };
}

function parseFillGapData(value: unknown) {
  if (typeof value !== 'object' || !value || !('answer' in value)) {
    return null;
  }

  if (typeof value.answer !== 'string') {
    return null;
  }

  return {
    answer: value.answer,
  };
}

function parseSingleAnswerData(value: unknown) {
  if (typeof value !== 'object' || !value) {
    return null;
  }

  if (!('sampleAnswer' in value) || !('gradingCriteria' in value)) {
    return null;
  }

  if (typeof value.sampleAnswer !== 'string' || !Array.isArray(value.gradingCriteria)) {
    return null;
  }

  return {
    sampleAnswer: value.sampleAnswer,
    gradingCriteria: value.gradingCriteria.filter(item => typeof item === 'string') as string[],
  };
}

export function ExerciseCards(props: ExerciseCardsProps) {
  const t = useTranslations('DashboardExercisesPage');

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
          const multipleChoiceData = parseMultipleChoiceData(exercise.exerciseData);
          const fillGapData = parseFillGapData(exercise.exerciseData);
          const singleAnswerData = parseSingleAnswerData(exercise.exerciseData);

          return (
            <article key={exercise.id} className="rounded-md border border-gray-200 bg-white p-4">
              <p className="text-xs tracking-wide text-gray-500 uppercase">{exercise.type}</p>
              <h3 className="mt-2 text-sm font-semibold text-gray-900">{exercise.question}</h3>

              {exercise.type === 'multiple_choice' && multipleChoiceData && (
                <ol className="mt-3 list-inside list-decimal space-y-1 text-sm text-gray-700">
                  {multipleChoiceData.options.map(option => (
                    <li key={`${exercise.id}-${option}`}>{option}</li>
                  ))}
                  <li className="mt-2 list-none text-xs text-gray-500">
                    {t('answer_label')}
                    :
                    {' '}
                    {multipleChoiceData.correctIndex + 1}
                  </li>
                </ol>
              )}

              {exercise.type === 'fill_gap' && fillGapData && (
                <p className="mt-3 text-sm text-gray-700">
                  {t('answer_label')}
                  :
                  {' '}
                  {fillGapData.answer}
                </p>
              )}

              {exercise.type === 'single_answer' && singleAnswerData && (
                <div className="mt-3 space-y-2 text-sm text-gray-700">
                  <p>
                    {t('sample_answer_label')}
                    :
                    {' '}
                    {singleAnswerData.sampleAnswer}
                  </p>
                  <ul className="list-inside list-disc">
                    {singleAnswerData.gradingCriteria.map(item => (
                      <li key={`${exercise.id}-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
