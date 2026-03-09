'use client';

import { useTranslations } from 'next-intl';
import { DocumentUploadPanel } from '@/components/documents/DocumentUploadPanel';
import { useDocumentsWorkspace } from '@/components/documents/useDocumentsWorkspace';
import { Link } from '@/libs/I18nNavigation';

const secondaryButtonClassName = 'inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2.5 text-sm font-semibold text-secondary shadow-xs-skeumorphic ring-1 ring-primary transition hover:bg-primary_hover hover:text-secondary_hover';

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

        <div className="flex flex-wrap gap-3 lg:justify-end">
          <Link href="/dashboard/content/" className={secondaryButtonClassName}>
            {t('content_cta')}
          </Link>
          <Link href="/dashboard/exercises/" className={secondaryButtonClassName}>
            {t('exercises_cta')}
          </Link>
          <Link href="/dashboard/progress/" className={secondaryButtonClassName}>
            {t('progress_cta')}
          </Link>
        </div>
      </section>

      <DocumentUploadPanel
        errorMessage={documentsWorkspace.errorMessage}
        isSubmitting={documentsWorkspace.isUploading}
        onSubmitPdf={documentsWorkspace.submitPdf}
        onSubmitText={documentsWorkspace.submitText}
        onSubmitUrl={documentsWorkspace.submitUrl}
        resetKey={documentsWorkspace.uploadResetKey}
        statusMessage={documentsWorkspace.statusMessage}
        variant="dashboard"
      />
    </div>
  );
}
