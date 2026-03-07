'use client';

import type { DocumentListItem } from '@/validations/DocumentValidation';
import type { GenerateExercisesRequest } from '@/validations/ExerciseValidation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { GenerateExercisesRequestSchema } from '@/validations/ExerciseValidation';

type ExerciseGeneratorFormProps = {
  documents: DocumentListItem[];
  isSubmitting: boolean;
  onSubmit: (request: GenerateExercisesRequest) => Promise<void>;
  serverError: string | null;
};

export function ExerciseGeneratorForm(props: ExerciseGeneratorFormProps) {
  const t = useTranslations('DashboardExercisesPage');
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [exerciseType, setExerciseType] = useState<GenerateExercisesRequest['exerciseType']>('multiple_choice');
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<GenerateExercisesRequest['difficulty']>();
  const [topicFocus, setTopicFocus] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const availableDocumentIds = new Set(props.documents.map(document => document.id));
  const activeSelectedDocumentIds = selectedDocumentIds.filter(id => availableDocumentIds.has(id));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = GenerateExercisesRequestSchema.safeParse({
      documentIds: activeSelectedDocumentIds,
      exerciseType,
      count,
      difficulty,
      topicFocus: topicFocus.trim() || undefined,
    });

    if (!parsed.success) {
      setFormError(t('form_validation_error'));
      return;
    }

    await props.onSubmit(parsed.data);
  }

  function toggleDocumentSelection(documentId: string) {
    setSelectedDocumentIds((current) => {
      if (current.includes(documentId)) {
        return current.filter(id => id !== documentId);
      }

      return [...current, documentId];
    });
  }

  return (
    <form className="space-y-5 rounded-md border border-gray-200 bg-white p-4" onSubmit={handleSubmit}>
      <div>
        <p className="text-sm font-semibold text-gray-900">{t('documents_label')}</p>
        <p className="mt-1 text-sm text-gray-600">{t('documents_help')}</p>
        <div className="mt-3 space-y-2">
          {props.documents.map(document => (
            <label key={document.id} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                checked={activeSelectedDocumentIds.includes(document.id)}
                className="h-4 w-4 rounded border-gray-300"
                onChange={() => toggleDocumentSelection(document.id)}
                type="checkbox"
              />
              <span>
                {document.title}
                {' '}
                <span className="text-gray-500">
                  (
                  {t(`document_type_${document.contentType}`)}
                  )
                </span>
              </span>
            </label>
          ))}
          {props.documents.length === 0 && (
            <p className="text-sm text-gray-500">{t('no_ready_documents')}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-gray-700">
          <span className="mb-1 block font-medium">{t('exercise_type_label')}</span>
          <select
            className="w-full rounded-sm border border-gray-300 px-2 py-1"
            onChange={event => setExerciseType(event.target.value as GenerateExercisesRequest['exerciseType'])}
            value={exerciseType}
          >
            <option value="multiple_choice">{t('exercise_type_multiple_choice')}</option>
            <option value="fill_gap">{t('exercise_type_fill_gap')}</option>
            <option value="single_answer">{t('exercise_type_single_answer')}</option>
          </select>
        </label>

        <label className="text-sm text-gray-700">
          <span className="mb-1 block font-medium">{t('count_label')}</span>
          <input
            className="w-full rounded-sm border border-gray-300 px-2 py-1"
            max={20}
            min={1}
            onChange={event => setCount(Number(event.target.value))}
            type="number"
            value={count}
          />
        </label>

        <label className="text-sm text-gray-700">
          <span className="mb-1 block font-medium">{t('difficulty_label')}</span>
          <select
            className="w-full rounded-sm border border-gray-300 px-2 py-1"
            onChange={(event) => {
              const value = event.target.value;
              if (value === '') {
                setDifficulty(undefined);
                return;
              }
              setDifficulty(value as NonNullable<GenerateExercisesRequest['difficulty']>);
            }}
            value={difficulty ?? ''}
          >
            <option value="">{t('difficulty_any')}</option>
            <option value="beginner">{t('difficulty_beginner')}</option>
            <option value="intermediate">{t('difficulty_intermediate')}</option>
            <option value="advanced">{t('difficulty_advanced')}</option>
          </select>
        </label>

        <label className="text-sm text-gray-700">
          <span className="mb-1 block font-medium">{t('topic_focus_label')}</span>
          <input
            className="w-full rounded-sm border border-gray-300 px-2 py-1"
            maxLength={120}
            onChange={event => setTopicFocus(event.target.value)}
            placeholder={t('topic_focus_placeholder')}
            type="text"
            value={topicFocus}
          />
        </label>
      </div>

      {(formError || props.serverError) && (
        <p className="text-sm text-red-600">{formError ?? props.serverError}</p>
      )}

      <button
        className="rounded-sm bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={props.isSubmitting || props.documents.length === 0}
        type="submit"
      >
        {props.isSubmitting ? t('submit_loading') : t('submit_button')}
      </button>
    </form>
  );
}
