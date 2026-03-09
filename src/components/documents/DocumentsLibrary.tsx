'use client';

import type { DocumentListItem } from '@/validations/DocumentValidation';
import { CheckCircle, FileSearch03, Globe01, Upload01 } from '@untitledui/icons';
import { useTranslations } from 'next-intl';
import { badgeStyles, buttonStyles, panelStyles, statusBadgeStyles } from '@/components/ui/styles';

type DocumentsLibraryProps = {
  documents: DocumentListItem[];
  onDelete: (document: DocumentListItem) => void;
  title?: string;
  description?: string;
  emptyMessage?: string;
  variant?: 'full' | 'compact';
};

function isSafeUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function DocumentsLibrary(props: DocumentsLibraryProps) {
  const t = useTranslations('DashboardContentPage');
  const isCompact = props.variant === 'compact';
  const visibleDocuments = isCompact
    ? [...props.documents]
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, 5)
    : props.documents;
  const title = props.title ?? t('library_title');
  const description = props.description ?? t('library_description');
  const emptyMessage = props.emptyMessage ?? t('library_empty');

  if (visibleDocuments.length === 0) {
    return (
      <section className={panelStyles()}>
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-brand-50 p-3 text-brand-600">
            <FileSearch03 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-ink-950">{title}</h2>
            {description && (
              <p className="mt-2 text-sm leading-6 text-ink-600">{description}</p>
            )}
            <p className="mt-2 text-sm leading-6 text-ink-600">{emptyMessage}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={panelStyles()}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink-950">{title}</h2>
          {description && (
            <p className="mt-2 text-sm leading-6 text-ink-600">{description}</p>
          )}
        </div>
        {!isCompact && (
          <p className={badgeStyles({ tone: 'neutral' })}>{t('document_count', { count: visibleDocuments.length })}</p>
        )}
      </div>

      <ul className="mt-5 space-y-3">
        {visibleDocuments.map(document => (
          <li key={document.id} className="rounded-[1.5rem] border border-white/85 bg-ink-50/90 p-4 shadow-xs">
            {isCompact
              ? (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-ink-950">{document.title}</h3>
                        <span className={statusBadgeStyles(document.status)}>
                          {t(`status_${document.status}`)}
                        </span>
                        <span className={badgeStyles({ tone: 'neutral' })}>
                          {t(`type_${document.contentType}`)}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-ink-600">
                        <span className="font-medium text-ink-900">
                          {t('created_at_label')}
                          :
                          {' '}
                        </span>
                        <span>{new Date(document.createdAt).toLocaleString()}</span>
                      </p>
                      {document.errorMessage && (
                        <p className="mt-3 rounded-2xl border border-error-100 bg-error-50 px-3 py-2 text-sm text-error-700">
                          {document.errorMessage}
                        </p>
                      )}
                    </div>

                    <button
                      className={buttonStyles({ size: 'sm' })}
                      onClick={() => props.onDelete(document)}
                      type="button"
                    >
                      {t('delete_button')}
                    </button>
                  </div>
                )
              : (
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-ink-950">{document.title}</h3>
                        <span className={statusBadgeStyles(document.status)}>
                          {t(`status_${document.status}`)}
                        </span>
                        <span className={badgeStyles({ tone: 'neutral' })}>
                          {t(`type_${document.contentType}`)}
                        </span>
                      </div>

                      <dl className="mt-4 grid gap-3 text-sm text-ink-600 md:grid-cols-2">
                        {document.processedAt && (
                          <div className="rounded-2xl bg-white/85 p-3">
                            <dt className="inline-flex items-center gap-2 font-medium text-ink-900">
                              <CheckCircle className="h-4 w-4 text-success-500" />
                              {t('processed_at_label')}
                              :
                            </dt>
                            <dd className="mt-1">{new Date(document.processedAt).toLocaleString()}</dd>
                          </div>
                        )}
                        {document.originalFilename && (
                          <div className="rounded-2xl bg-white/85 p-3">
                            <dt className="inline-flex items-center gap-2 font-medium text-ink-900">
                              <Upload01 className="h-4 w-4 text-brand-600" />
                              {t('filename_label')}
                              :
                            </dt>
                            <dd className="mt-1 break-all">{document.originalFilename}</dd>
                          </div>
                        )}
                        {document.sourceUrl && (
                          <div className="rounded-2xl bg-white/85 p-3 md:col-span-2">
                            <dt className="inline-flex items-center gap-2 font-medium text-ink-900">
                              <Globe01 className="h-4 w-4 text-brand-600" />
                              {t('source_url_label')}
                            </dt>
                            <dd className="mt-1 break-all">
                              {isSafeUrl(document.sourceUrl)
                                ? (
                                    <a className="text-brand-700 hover:text-brand-800" href={document.sourceUrl} rel="noreferrer" target="_blank">
                                      {document.sourceUrl}
                                    </a>
                                  )
                                : document.sourceUrl}
                            </dd>
                          </div>
                        )}
                      </dl>

                      {document.errorMessage && (
                        <p className="mt-3 rounded-2xl border border-error-100 bg-error-50 px-3 py-2 text-sm text-error-700">
                          {document.errorMessage}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        className={buttonStyles({ size: 'sm' })}
                        onClick={() => props.onDelete(document)}
                        type="button"
                      >
                        {t('delete_button')}
                      </button>
                    </div>
                  </div>
                )}
          </li>
        ))}
      </ul>
    </section>
  );
}
