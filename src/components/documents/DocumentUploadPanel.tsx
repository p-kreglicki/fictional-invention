'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

type UploadMode = 'pdf' | 'url' | 'text';

type DocumentUploadPanelProps = {
  isSubmitting: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
  onSubmitPdf: (input: { file: File; title: string }) => Promise<void>;
  onSubmitUrl: (input: { url: string; title: string }) => Promise<void>;
  onSubmitText: (input: { title: string; content: string }) => Promise<void>;
};

function UploadModeButton(props: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`rounded-md px-3 py-2 text-sm font-medium transition ${
        props.isActive
          ? 'bg-slate-900 text-white'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
      }`}
      onClick={props.onClick}
      type="button"
    >
      {props.label}
    </button>
  );
}

export function DocumentUploadPanel(props: DocumentUploadPanelProps) {
  const t = useTranslations('DashboardContentPage');
  const [mode, setMode] = useState<UploadMode>('pdf');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [textContent, setTextContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClientError(null);

    if (mode === 'pdf') {
      if (!selectedFile) {
        setClientError(t('pdf_missing_file'));
        return;
      }

      await props.onSubmitPdf({
        file: selectedFile,
        title: title.trim(),
      });
      return;
    }

    if (mode === 'url') {
      if (!url.trim()) {
        setClientError(t('url_missing_value'));
        return;
      }

      await props.onSubmitUrl({
        url: url.trim(),
        title: title.trim(),
      });
      return;
    }

    if (!title.trim() || !textContent.trim()) {
      setClientError(t('text_missing_value'));
      return;
    }

    await props.onSubmitText({
      title: title.trim(),
      content: textContent,
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t('upload_title')}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{t('upload_description')}</p>
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('upload_mode_group_label')}>
          <UploadModeButton
            label={t('upload_mode_pdf')}
            isActive={mode === 'pdf'}
            onClick={() => setMode('pdf')}
          />
          <UploadModeButton
            label={t('upload_mode_url')}
            isActive={mode === 'url'}
            onClick={() => setMode('url')}
          />
          <UploadModeButton
            label={t('upload_mode_text')}
            isActive={mode === 'text'}
            onClick={() => setMode('text')}
          />
        </div>
      </div>

      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm text-slate-700">
          <span className="mb-1 block font-medium">{t('title_label')}</span>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            maxLength={200}
            onChange={event => setTitle(event.target.value)}
            placeholder={mode === 'text' ? t('text_title_placeholder') : t('title_placeholder')}
            type="text"
            value={title}
          />
        </label>

        {mode === 'pdf' && (
          <label className="block rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-700">
            <span className="mb-2 block font-medium text-slate-900">{t('pdf_label')}</span>
            <span className="mb-3 block text-sm leading-6 text-slate-600">{t('pdf_help')}</span>
            <input
              accept="application/pdf"
              className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setSelectedFile(file);
              }}
              type="file"
            />
            {selectedFile && (
              <p className="mt-3 text-sm text-slate-600">
                {t('selected_file')}
                :
                {' '}
                {selectedFile.name}
              </p>
            )}
          </label>
        )}

        {mode === 'url' && (
          <label className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">{t('url_label')}</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              onChange={event => setUrl(event.target.value)}
              placeholder="https://example.com/article"
              type="url"
              value={url}
            />
          </label>
        )}

        {mode === 'text' && (
          <label className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">{t('text_label')}</span>
            <textarea
              className="min-h-40 w-full rounded-md border border-slate-300 px-3 py-2"
              maxLength={100000}
              onChange={event => setTextContent(event.target.value)}
              placeholder={t('text_placeholder')}
              value={textContent}
            />
          </label>
        )}

        {(clientError || props.errorMessage) && (
          <p className="text-sm text-red-600" role="alert">
            {clientError ?? props.errorMessage}
          </p>
        )}

        {props.statusMessage && (
          <p className="text-sm text-slate-600" aria-live="polite">
            {props.statusMessage}
          </p>
        )}

        <button
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={props.isSubmitting}
          type="submit"
        >
          {props.isSubmitting ? t('upload_loading') : t('upload_submit')}
        </button>
      </form>
    </section>
  );
}
