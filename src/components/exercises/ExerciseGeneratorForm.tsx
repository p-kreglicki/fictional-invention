'use client';

import type { SelectItemType } from '@/components/untitled/base/select/select';
import type { DocumentListItem } from '@/validations/DocumentValidation';
import type { GenerateExercisesRequest } from '@/validations/ExerciseValidation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useListData } from 'react-stately';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { panelStyles } from '@/components/ui/styles';
import { MultiSelect } from '@/components/untitled/base/select/multi-select';
import { GenerateExercisesRequestSchema } from '@/validations/ExerciseValidation';

type ExerciseGeneratorFormProps = {
  documents: DocumentListItem[];
  isSubmitting: boolean;
  onSubmit: (request: GenerateExercisesRequest) => Promise<void>;
  serverError: string | null;
};

export function ExerciseGeneratorForm(props: ExerciseGeneratorFormProps) {
  const t = useTranslations('DashboardExercisesPage');
  const [exerciseType, setExerciseType] = useState<GenerateExercisesRequest['exerciseType']>('multiple_choice');
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<GenerateExercisesRequest['difficulty']>();
  const [topicFocus, setTopicFocus] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const documentOptions = useMemo<SelectItemType[]>(() => (
    props.documents.map(document => ({
      id: document.id,
      label: document.title,
      supportingText: t(`document_type_${document.contentType}`),
    }))
  ), [props.documents, t]);

  const documentOptionsById = useMemo(() => (
    new Map(documentOptions.map(option => [option.id, option]))
  ), [documentOptions]);

  const selectedDocuments = useListData<SelectItemType>({
    initialItems: [],
    getKey: item => item.id,
  });
  const selectedDocumentItems = selectedDocuments.items;

  useEffect(() => {
    const availableDocumentIds = new Set(documentOptions.map(option => option.id));
    const staleSelectedDocumentIds = selectedDocumentItems
      .map(item => item.id)
      .filter(id => !availableDocumentIds.has(id));

    if (staleSelectedDocumentIds.length > 0) {
      selectedDocuments.remove(...staleSelectedDocumentIds);
    }

    for (const selectedDocument of selectedDocumentItems) {
      const nextOption = documentOptionsById.get(selectedDocument.id);

      if (!nextOption) {
        continue;
      }

      if (
        selectedDocument.label !== nextOption.label
        || selectedDocument.supportingText !== nextOption.supportingText
      ) {
        selectedDocuments.update(selectedDocument.id, nextOption);
      }
    }
  }, [documentOptions, documentOptionsById, selectedDocumentItems]);

  const activeSelectedDocumentIds = selectedDocumentItems.map(item => item.id);
  const documentsFieldKey = documentOptions
    .map(option => `${option.id}:${option.label}:${option.supportingText ?? ''}`)
    .join('|');

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

  return (
    <form className={panelStyles({ className: 'space-y-5' })} onSubmit={handleSubmit}>
      <div>
        <MultiSelect
          key={documentsFieldKey}
          isDisabled={props.documents.length === 0}
          items={documentOptions}
          label={t('documents_label')}
          hint={t('documents_help')}
          placeholder={t('documents_search_placeholder')}
          selectedItems={selectedDocuments}
        >
          {item => <MultiSelect.Item {...item} />}
        </MultiSelect>

        {props.documents.length === 0 && (
          <p className="mt-2 text-sm text-ink-500">{t('no_ready_documents')}</p>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
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
