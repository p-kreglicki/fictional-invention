'use client';

import type { ProgressSourceDocument } from '@/validations/ResponseValidation';
import { useTranslations } from 'next-intl';

type ProgressFiltersProps = {
  availableDocuments: ProgressSourceDocument[];
  selectedDocumentId: string;
  onDocumentChange: (documentId: string) => void;
};

export function ProgressFilters(props: ProgressFiltersProps) {
  const t = useTranslations('DashboardProgressPage');

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <label className="block text-sm text-slate-700">
        <span className="mb-1 block font-medium">{t('filter_document_label')}</span>
        <select
          className="w-full rounded-md border border-slate-300 px-3 py-2"
          onChange={event => props.onDocumentChange(event.target.value)}
          value={props.selectedDocumentId}
        >
          <option value="">{t('filter_document_all')}</option>
          {props.availableDocuments.map(document => (
            <option key={document.id} value={document.id}>{document.title}</option>
          ))}
        </select>
      </label>
    </section>
  );
}
