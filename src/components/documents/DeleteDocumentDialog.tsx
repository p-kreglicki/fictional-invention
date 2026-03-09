'use client';

import type { DocumentListItem } from '@/validations/DocumentValidation';
import { AlertCircle } from '@untitledui/icons';
import { useTranslations } from 'next-intl';
import { buttonStyles, panelStyles } from '@/components/ui/styles';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/45 px-4 backdrop-blur-sm">
      <div
        aria-labelledby="delete-document-title"
        aria-modal="true"
        className={panelStyles({ className: 'w-full max-w-md border-error-100 p-6 shadow-panel' })}
        role="dialog"
      >
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-error-50 p-3 text-error-700">
            <AlertCircle className="h-5 w-5" />
          </div>
          <h2 id="delete-document-title" className="text-lg font-semibold text-ink-950">
            {t('delete_dialog_title')}
          </h2>
        </div>
        <p className="mt-4 text-sm leading-6 text-ink-600">
          {t('delete_dialog_description', { title: props.document.title })}
        </p>

        {props.errorMessage && (
          <p className="mt-4 rounded-2xl border border-error-100 bg-error-50 px-3 py-2 text-sm text-error-700">
            {props.errorMessage}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            className={buttonStyles()}
            onClick={props.onCancel}
            type="button"
          >
            {t('delete_cancel')}
          </button>
          <button
            className={buttonStyles({ tone: 'danger' })}
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
