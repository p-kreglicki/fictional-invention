'use client';

import { useTranslations } from 'next-intl';
import { DocumentUploadPanel } from '@/components/documents/DocumentUploadPanel';
import { useDocumentsWorkspace } from '@/components/documents/useDocumentsWorkspace';

export function DashboardOverview() {
  const t = useTranslations('DashboardOverviewPage');
  const documentsWorkspace = useDocumentsWorkspace();

  return (
    <div className="space-y-6 py-6">
      <section className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-semibold text-ink-950 sm:text-4xl">{t('title')}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-600">{t('description')}</p>
        </div>
      </section>

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
        variant="dashboard"
      />
    </div>
  );
}
