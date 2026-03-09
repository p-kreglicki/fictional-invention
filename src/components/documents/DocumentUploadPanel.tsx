'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useReducer } from 'react';

type UploadMode = 'pdf' | 'url' | 'text';

type DocumentUploadPanelProps = {
  isSubmitting: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
  resetKey?: number;
  variant?: 'page' | 'modal';
  onSubmitPdf: (input: { file: File; title: string }) => Promise<void>;
  onSubmitUrl: (input: { url: string; title: string }) => Promise<void>;
  onSubmitText: (input: { title: string; content: string }) => Promise<void>;
};

type UploadFormState = {
  mode: UploadMode;
  title: string;
  url: string;
  textContent: string;
  selectedFile: File | null;
  clientError: string | null;
  fileInputKey: number;
};

type UploadFormAction
  = | { type: 'set_mode'; mode: UploadMode }
    | { type: 'set_title'; value: string }
    | { type: 'set_url'; value: string }
    | { type: 'set_text_content'; value: string }
    | { type: 'set_selected_file'; file: File | null }
    | { type: 'set_client_error'; value: string | null }
    | { type: 'reset_form' };

function createInitialUploadFormState(): UploadFormState {
  return {
    mode: 'pdf',
    title: '',
    url: '',
    textContent: '',
    selectedFile: null,
    clientError: null,
    fileInputKey: 0,
  };
}

function uploadFormReducer(state: UploadFormState, action: UploadFormAction): UploadFormState {
  switch (action.type) {
    case 'set_mode':
      return {
        ...state,
        clientError: null,
        mode: action.mode,
      };
    case 'set_title':
      return {
        ...state,
        title: action.value,
      };
    case 'set_url':
      return {
        ...state,
        url: action.value,
      };
    case 'set_text_content':
      return {
        ...state,
        textContent: action.value,
      };
    case 'set_selected_file':
      return {
        ...state,
        selectedFile: action.file,
      };
    case 'set_client_error':
      return {
        ...state,
        clientError: action.value,
      };
    case 'reset_form':
      return {
        ...state,
        title: '',
        url: '',
        textContent: '',
        selectedFile: null,
        clientError: null,
        fileInputKey: state.fileInputKey + 1,
      };
  }
}

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
  const [state, dispatch] = useReducer(uploadFormReducer, undefined, createInitialUploadFormState);
  const isModal = props.variant === 'modal';

  useEffect(() => {
    dispatch({ type: 'reset_form' });
  }, [props.resetKey]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch({ type: 'set_client_error', value: null });

    if (state.mode === 'pdf') {
      if (!state.selectedFile) {
        dispatch({ type: 'set_client_error', value: t('pdf_missing_file') });
        return;
      }

      await props.onSubmitPdf({
        file: state.selectedFile,
        title: state.title.trim(),
      });
      return;
    }

    if (state.mode === 'url') {
      if (!state.url.trim()) {
        dispatch({ type: 'set_client_error', value: t('url_missing_value') });
        return;
      }

      await props.onSubmitUrl({
        url: state.url.trim(),
        title: state.title.trim(),
      });
      return;
    }

    if (!state.title.trim() || !state.textContent.trim()) {
      dispatch({ type: 'set_client_error', value: t('text_missing_value') });
      return;
    }

    await props.onSubmitText({
      title: state.title.trim(),
      content: state.textContent,
    });
  }

  return (
    <section className={isModal ? '' : 'rounded-xl border border-slate-200 bg-white p-5'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {!isModal && (
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t('upload_title')}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{t('upload_description')}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('upload_mode_group_label')}>
          <UploadModeButton
            label={t('upload_mode_pdf')}
            isActive={state.mode === 'pdf'}
            onClick={() => {
              dispatch({ type: 'set_mode', mode: 'pdf' });
            }}
          />
          <UploadModeButton
            label={t('upload_mode_url')}
            isActive={state.mode === 'url'}
            onClick={() => {
              dispatch({ type: 'set_mode', mode: 'url' });
            }}
          />
          <UploadModeButton
            label={t('upload_mode_text')}
            isActive={state.mode === 'text'}
            onClick={() => {
              dispatch({ type: 'set_mode', mode: 'text' });
            }}
          />
        </div>
      </div>

      <form className={isModal ? 'mt-4 space-y-4' : 'mt-5 space-y-4'} onSubmit={handleSubmit}>
        <label className="block text-sm text-slate-700">
          <span className="mb-1 block font-medium">{t('title_label')}</span>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            maxLength={200}
            onChange={event => dispatch({ type: 'set_title', value: event.target.value })}
            placeholder={state.mode === 'text' ? t('text_title_placeholder') : t('title_placeholder')}
            type="text"
            value={state.title}
          />
        </label>

        {state.mode === 'pdf' && (
          <label className="block rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-700">
            <span className="mb-2 block font-medium text-slate-900">{t('pdf_label')}</span>
            <span className="mb-3 block text-sm leading-6 text-slate-600">{t('pdf_help')}</span>
            <input
              accept="application/pdf"
              className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
              key={state.fileInputKey}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                dispatch({ type: 'set_selected_file', file });
              }}
              type="file"
            />
            {state.selectedFile && (
              <p className="mt-3 text-sm text-slate-600">
                {t('selected_file')}
                :
                {' '}
                {state.selectedFile.name}
              </p>
            )}
          </label>
        )}

        {state.mode === 'url' && (
          <label className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">{t('url_label')}</span>
            <input
              className="w-full rounded-md border border-slate-300 px-3 py-2"
              onChange={event => dispatch({ type: 'set_url', value: event.target.value })}
              placeholder="https://example.com/article"
              type="url"
              value={state.url}
            />
          </label>
        )}

        {state.mode === 'text' && (
          <label className="block text-sm text-slate-700">
            <span className="mb-1 block font-medium">{t('text_label')}</span>
            <textarea
              className="min-h-40 w-full rounded-md border border-slate-300 px-3 py-2"
              maxLength={100000}
              onChange={event => dispatch({ type: 'set_text_content', value: event.target.value })}
              placeholder={t('text_placeholder')}
              value={state.textContent}
            />
          </label>
        )}

        {(state.clientError || props.errorMessage) && (
          <p className="text-sm text-red-600" role="alert">
            {state.clientError ?? props.errorMessage}
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
