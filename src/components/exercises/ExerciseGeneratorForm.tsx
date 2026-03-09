'use client';

import type { DocumentListItem } from '@/validations/DocumentValidation';
import type { GenerateExercisesRequest } from '@/validations/ExerciseValidation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { panelStyles } from '@/components/ui/styles';
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
    <form className={panelStyles({ className: 'space-y-5' })} onSubmit={handleSubmit}>
      <div>
        <p className="text-sm font-semibold text-ink-900">{t('documents_label')}</p>
        <p className="mt-1 text-sm text-ink-600">{t('documents_help')}</p>
        <div className="mt-3 space-y-2">
          {props.documents.map(document => (
            <Checkbox
              key={document.id}
              className="rounded-lg border border-ink-100 bg-ink-50/75 px-4 py-3"
              isSelected={activeSelectedDocumentIds.includes(document.id)}
              label={(
                <span>
                  {document.title}
                  {' '}
                  <span className="text-ink-500">
                    (
                    {t(`document_type_${document.contentType}`)}
                    )
                  </span>
                </span>
              )}
              onChange={() => toggleDocumentSelection(document.id)}
            />
          ))}
          {props.documents.length === 0 && (
            <p className="text-sm text-ink-500">{t('no_ready_documents')}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Select
          label={t('exercise_type_label')}
          onChange={event => setExerciseType(event.target.value as GenerateExercisesRequest['exerciseType'])}
          options={[
            { label: t('exercise_type_multiple_choice'), value: 'multiple_choice' },
            { label: t('exercise_type_fill_gap'), value: 'fill_gap' },
            { label: t('exercise_type_single_answer'), value: 'single_answer' },
          ]}
          value={exerciseType}
        />

        <Input
          label={t('count_label')}
          max={20}
          min={1}
          onChange={value => setCount(Number(value))}
          type="number"
          value={count}
        />

        <Select
          label={t('difficulty_label')}
          onChange={(event) => {
            const value = event.target.value;
            if (value === '') {
              setDifficulty(undefined);
              return;
            }
            setDifficulty(value as NonNullable<GenerateExercisesRequest['difficulty']>);
          }}
          options={[
            { label: t('difficulty_any'), value: '' },
            { label: t('difficulty_beginner'), value: 'beginner' },
            { label: t('difficulty_intermediate'), value: 'intermediate' },
            { label: t('difficulty_advanced'), value: 'advanced' },
          ]}
          value={difficulty ?? ''}
        />

        <Input
          label={t('topic_focus_label')}
          maxLength={120}
          onChange={value => setTopicFocus(value)}
          placeholder={t('topic_focus_placeholder')}
          type="text"
          value={topicFocus}
        />
      </div>

      {(formError || props.serverError) && (
        <p className="rounded-2xl border border-error-100 bg-error-50 px-4 py-3 text-sm text-error-700">{formError ?? props.serverError}</p>
      )}

      <Button
        disabled={props.isSubmitting || props.documents.length === 0}
        type="submit"
        variant="primary"
      >
        {props.isSubmitting ? t('submit_loading') : t('submit_button')}
      </Button>
    </form>
  );
}
