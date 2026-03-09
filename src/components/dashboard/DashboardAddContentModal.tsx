'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { DeleteDocumentDialog } from '@/components/documents/DeleteDocumentDialog';
import { DocumentsLibrary } from '@/components/documents/DocumentsLibrary';
import { DocumentUploadPanel } from '@/components/documents/DocumentUploadPanel';
import { useDocumentsWorkspace } from '@/components/documents/useDocumentsWorkspace';

type DashboardAddContentModalProps = {
  onClose: () => void;
  onSummaryRefresh: () => Promise<void>;
};

export function DashboardAddContentModal(props: DashboardAddContentModalProps) {
  const overviewT = useTranslations('DashboardOverviewPage');
  const contentT = useTranslations('DashboardContentPage');
  const [sessionDocumentIds, setSessionDocumentIds] = useState<string[]>([]);
  const documentsWorkspace = useDocumentsWorkspace({
    onDeleteSuccess: async (input) => {
      setSessionDocumentIds(current => current.filter(documentId => documentId !== input.deletedDocumentId));
      await props.onSummaryRefresh();
    },
    onUploadSuccess: async (input) => {
      const previousDocumentIds = new Set(input.previousDocuments.map(document => document.id));
      const newSessionDocumentIds = input.nextDocuments
        .filter(document => !previousDocumentIds.has(document.id))
        .map(document => document.id);

      if (newSessionDocumentIds.length > 0) {
        setSessionDocumentIds(current => [...new Set([...newSessionDocumentIds, ...current])]);
      }

      await props.onSummaryRefresh();
    },
  });
  const canClose = !documentsWorkspace.isUploading && !documentsWorkspace.isDeleting;
  const sessionDocuments = documentsWorkspace.documents.filter(document => sessionDocumentIds.includes(document.id));

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || !canClose) {
        return;
      }

      props.onClose();
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [canClose, props.onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 px-3 py-4 sm:px-6 sm:py-8">
        <button
          aria-label={overviewT('content_modal_close')}
          className="absolute inset-0"
          disabled={!canClose}
          onClick={props.onClose}
          tabIndex={-1}
          type="button"
        />
        <div
          aria-labelledby="dashboard-add-content-title"
          aria-modal="true"
          className="relative mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
          role="dialog"
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
            <div>
              <p className="text-sm font-medium tracking-[0.18em] text-slate-500 uppercase">
                {contentT('eyebrow')}
              </p>
              <h2 id="dashboard-add-content-title" className="mt-2 text-2xl font-semibold text-slate-950">
                {overviewT('content_modal_title')}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {overviewT('content_modal_description')}
              </p>
            </div>

            <button
              aria-label={overviewT('content_modal_close')}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canClose}
              onClick={props.onClose}
              type="button"
            >
              {overviewT('content_modal_close')}
            </button>
          </div>

          <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <DocumentUploadPanel
                errorMessage={documentsWorkspace.errorMessage}
                isSubmitting={documentsWorkspace.isUploading}
                onSubmitPdf={documentsWorkspace.submitPdf}
                onSubmitText={documentsWorkspace.submitText}
                onSubmitUrl={documentsWorkspace.submitUrl}
                resetKey={documentsWorkspace.uploadResetKey}
                statusMessage={documentsWorkspace.statusMessage}
                variant="modal"
              />
            </section>

            <div className="space-y-4">
              {documentsWorkspace.isBootstrapping
                ? (
                    <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
                      {contentT('loading')}
                    </section>
                  )
                : (
                    <DocumentsLibrary
                      description={overviewT('content_modal_recent_description')}
                      documents={sessionDocuments}
                      emptyMessage={overviewT('content_modal_recent_empty')}
                      onDelete={(document) => {
                        documentsWorkspace.clearDeleteErrorMessage();
                        documentsWorkspace.setDocumentToDelete(document);
                      }}
                      title={overviewT('content_modal_recent_title')}
                      variant="compact"
                    />
                  )}
            </div>
          </div>
        </div>
      </div>

      <DeleteDocumentDialog
        document={documentsWorkspace.documentToDelete}
        errorMessage={documentsWorkspace.deleteErrorMessage}
        isDeleting={documentsWorkspace.isDeleting}
        onCancel={() => {
          if (documentsWorkspace.isDeleting) {
            return;
          }

          documentsWorkspace.setDocumentToDelete(null);
          documentsWorkspace.clearDeleteErrorMessage();
        }}
        onConfirm={documentsWorkspace.confirmDelete}
      />
    </>
  );
}
