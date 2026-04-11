'use client';

import { useTranslations } from 'next-intl';
import { panelStyles } from '@/components/ui/styles';
import { DeleteDocumentDialog } from './DeleteDocumentDialog';
import { DocumentsLibrary } from './DocumentsLibrary';
import { DocumentUploadPanel } from './DocumentUploadPanel';
import { useDocumentsWorkspace } from './useDocumentsWorkspace';

export function DocumentsWorkspace() {
  const t = useTranslations('DashboardContentPage');
  const documentsWorkspace = useDocumentsWorkspace();

  return (
    <div className="space-y-6 py-6">
      <header className="flex flex-col gap-5">
        <div className="max-w-5xl">
          <h1 className="text-3xl font-semibold text-ink-950 sm:text-4xl">{t('title')}</h1>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-ink-600 sm:text-base">{t('description')}</p>
        </div>
      </header>

      <DocumentUploadPanel
        errorMessage={documentsWorkspace.errorMessage}
        onDismissPdfUpload={documentsWorkspace.dismissPdfUpload}
        onQueuePdfFiles={documentsWorkspace.queuePdfFiles}
        onRetryPdfUpload={documentsWorkspace.retryPdfUpload}
        isSubmitting={documentsWorkspace.isUploading}
        pdfUploads={documentsWorkspace.pdfUploadItems}
        onSubmitText={documentsWorkspace.submitText}
        onSubmitUrl={documentsWorkspace.submitUrl}
        resetKey={documentsWorkspace.uploadResetKey}
        statusMessage={documentsWorkspace.statusMessage}
      />

      {documentsWorkspace.isBootstrapping
        ? (
            <section className={panelStyles({ className: 'text-sm text-ink-600' })}>
              {t('loading')}
            </section>
          )
        : (
            <DocumentsLibrary
              documents={documentsWorkspace.documents}
              onDelete={(document) => {
                documentsWorkspace.clearDeleteErrorMessage();
                documentsWorkspace.setDocumentToDelete(document);
              }}
            />
          )}

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
    </div>
  );
}
