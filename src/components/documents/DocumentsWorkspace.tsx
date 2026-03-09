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
      <DocumentUploadPanel
        errorMessage={documentsWorkspace.errorMessage}
        isSubmitting={documentsWorkspace.isUploading}
        onSubmitPdf={documentsWorkspace.submitPdf}
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
