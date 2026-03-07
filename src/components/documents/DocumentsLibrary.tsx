'use client';

import type { DocumentListItem } from '@/validations/DocumentValidation';
import { useTranslations } from 'next-intl';

type DocumentsLibraryProps = {
  documents: DocumentListItem[];
  onDelete: (document: DocumentListItem) => void;
};

function getStatusClasses(status: DocumentListItem['status']) {
  switch (status) {
    case 'ready':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'failed':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'processing':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'uploading':
      return 'bg-sky-50 text-sky-700 border-sky-200';
  }
}

export function DocumentsLibrary(props: DocumentsLibraryProps) {
  const t = useTranslations('DashboardContentPage');

  if (props.documents.length === 0) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">{t('library_title')}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{t('library_empty')}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t('library_title')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t('library_description')}</p>
        </div>
        <p className="text-sm text-slate-500">{t('document_count', { count: props.documents.length })}</p>
      </div>

      <ul className="mt-5 space-y-3">
        {props.documents.map(document => (
          <li key={document.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-slate-900">{document.title}</h3>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClasses(document.status)}`}>
                    {t(`status_${document.status}`)}
                  </span>
                  <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {t(`type_${document.contentType}`)}
                  </span>
                </div>

                <dl className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
                  <div>
                    <dt className="font-medium text-slate-900">{t('created_at_label')}</dt>
                    <dd>{new Date(document.createdAt).toLocaleString()}</dd>
                  </div>
                  {document.processedAt && (
                    <div>
                      <dt className="font-medium text-slate-900">{t('processed_at_label')}</dt>
                      <dd>{new Date(document.processedAt).toLocaleString()}</dd>
                    </div>
                  )}
                  {document.chunkCount !== null && document.status === 'ready' && (
                    <div>
                      <dt className="font-medium text-slate-900">{t('chunk_count_label')}</dt>
                      <dd>{document.chunkCount}</dd>
                    </div>
                  )}
                  {document.originalFilename && (
                    <div>
                      <dt className="font-medium text-slate-900">{t('filename_label')}</dt>
                      <dd className="break-all">{document.originalFilename}</dd>
                    </div>
                  )}
                  {document.sourceUrl && (
                    <div className="md:col-span-2">
                      <dt className="font-medium text-slate-900">{t('source_url_label')}</dt>
                      <dd className="break-all">
                        <a className="text-blue-700 hover:text-blue-800" href={document.sourceUrl} rel="noreferrer" target="_blank">
                          {document.sourceUrl}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>

                {document.errorMessage && (
                  <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {document.errorMessage}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                  onClick={() => props.onDelete(document)}
                  type="button"
                >
                  {t('delete_button')}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
