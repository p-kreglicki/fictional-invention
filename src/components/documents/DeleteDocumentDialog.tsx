'use client';

import type { DocumentListItem } from '@/validations/DocumentValidation';
import { useTranslations } from 'next-intl';

type DeleteDocumentDialogProps = {
  document: DocumentListItem | null;
  isDeleting: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
};

export function DeleteDocumentDialog(props: DeleteDocumentDialogProps) {
  const t = useTranslations('DashboardContentPage');

  if (!props.document) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div
        aria-labelledby="delete-document-title"
        aria-modal="true"
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        role="dialog"
      >
        <h2 id="delete-document-title" className="text-lg font-semibold text-slate-900">
          {t('delete_dialog_title')}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {t('delete_dialog_description', { title: props.document.title })}
        </p>

        {props.errorMessage && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {props.errorMessage}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
            onClick={props.onCancel}
            type="button"
          >
            {t('delete_cancel')}
          </button>
          <button
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={props.isDeleting}
            onClick={() => {
              void props.onConfirm();
            }}
            type="button"
          >
            {props.isDeleting ? t('delete_loading') : t('delete_confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
