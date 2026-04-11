'use client';

import type { DocumentListItem } from '@/validations/DocumentValidation';
import { FileSearch03 } from '@untitledui/icons';
import { useTranslations } from 'next-intl';
import { badgeStyles, buttonStyles, panelStyles, statusBadgeStyles } from '@/components/ui/styles';
import { Table } from '@/components/untitled/application/table/table';

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

function formatDocumentProcessedDate(value: string | null) {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleString();
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

      {isCompact
        ? (
            <ul className="mt-5 space-y-3">
              {visibleDocuments.map(document => (
                <li key={document.id} className="rounded-[1.5rem] border border-white/85 bg-ink-50/90 p-4 shadow-xs">
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
                </li>
              ))}
            </ul>
          )
        : (
            <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-ink-100 bg-white shadow-xs">
              <Table aria-label={title}>
                <Table.Header>
                  <Table.Head isRowHeader>{t('table_header_file_name')}</Table.Head>
                  <Table.Head>{t('table_header_file_type')}</Table.Head>
                  <Table.Head>{t('table_header_file_status')}</Table.Head>
                  <Table.Head>{t('table_header_processed_date')}</Table.Head>
                  <Table.Head className="text-right">{t('table_header_actions')}</Table.Head>
                </Table.Header>
                <Table.Body>
                  {visibleDocuments.map(document => (
                    <Table.Row key={document.id}>
                      <Table.Cell>
                        <div className="min-w-0">
                          <p className="font-semibold text-ink-950">{document.title}</p>
                          {document.originalFilename && (
                            <p className="mt-1 text-xs break-all text-ink-500">{document.originalFilename}</p>
                          )}
                          {!document.originalFilename && document.sourceUrl && (
                            <p className="mt-1 text-xs break-all text-ink-500">
                              {isSafeUrl(document.sourceUrl)
                                ? (
                                    <a className="text-brand-700 hover:text-brand-800" href={document.sourceUrl} rel="noreferrer" target="_blank">
                                      {document.sourceUrl}
                                    </a>
                                  )
                                : document.sourceUrl}
                            </p>
                          )}
                          {document.errorMessage && (
                            <p className="mt-2 text-xs text-error-700">{document.errorMessage}</p>
                          )}
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <span className={badgeStyles({ tone: 'neutral' })}>
                          {t(`type_${document.contentType}`)}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <span className={statusBadgeStyles(document.status)}>
                          {t(`status_${document.status}`)}
                        </span>
                      </Table.Cell>
                      <Table.Cell>
                        <span className={document.processedAt ? 'text-ink-600' : 'text-ink-400'}>
                          {formatDocumentProcessedDate(document.processedAt) ?? t('table_processed_date_pending')}
                        </span>
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <button
                          className={buttonStyles({ size: 'sm' })}
                          onClick={() => props.onDelete(document)}
                          type="button"
                        >
                          {t('delete_button')}
                        </button>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          )}
    </section>
  );
}
