'use client';

import type { ProgressSourceDocument } from '@/validations/ResponseValidation';
import { useTranslations } from 'next-intl';
import { Select } from '@/components/ui/Select';
import { panelStyles } from '@/components/ui/styles';

type ProgressFiltersProps = {
  availableDocuments: ProgressSourceDocument[];
  selectedDocumentId: string;
  onDocumentChange: (documentId: string) => void;
};

export function ProgressFilters(props: ProgressFiltersProps) {
  const t = useTranslations('DashboardProgressPage');

  return (
    <section className={panelStyles()}>
      <Select
        label={t('filter_document_label')}
        onChange={event => props.onDocumentChange(event.target.value)}
        options={[
          { label: t('filter_document_all'), value: '' },
          ...props.availableDocuments.map(document => ({
            label: document.title,
            value: document.id,
          })),
        ]}
        value={props.selectedDocumentId}
      />
    </section>
  );
}
