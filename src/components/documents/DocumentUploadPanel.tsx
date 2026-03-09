'use client';

import { UploadCloud02 } from '@untitledui/icons';
import { useTranslations } from 'next-intl';
import { useEffect, useReducer } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { fieldLabelStyles, panelStyles, textareaStyles } from '@/components/ui/styles';
import { FileUploadDropZone } from '@/components/untitled/application/file-upload/file-upload-base';
import { ButtonGroup, ButtonGroupItem } from '@/components/untitled/base/button-group/button-group';
import { cn } from '@/utils/cn';

type UploadMode = 'pdf' | 'url' | 'text';

type DocumentUploadPanelProps = {
  isSubmitting: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
  resetKey?: number;
  variant?: 'page' | 'modal' | 'dashboard';
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

export function DocumentUploadPanel(props: DocumentUploadPanelProps) {
  const t = useTranslations('DashboardContentPage');
  const [state, dispatch] = useReducer(uploadFormReducer, undefined, createInitialUploadFormState);
  const isModal = props.variant === 'modal';
  const isDashboard = props.variant === 'dashboard';

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

  function renderUploadModeGroup() {
    return (
      <ButtonGroup
        aria-label={t('upload_mode_group_label')}
        className="shadow-none"
        selectedKeys={[state.mode]}
        onSelectionChange={(value) => {
          const nextMode = Array.from(value)[0];

          if (typeof nextMode !== 'string') {
            return;
          }

          dispatch({ type: 'set_mode', mode: nextMode as UploadMode });
        }}
      >
        <ButtonGroupItem id="pdf">{t('upload_mode_pdf')}</ButtonGroupItem>
        <ButtonGroupItem id="url">{t('upload_mode_url')}</ButtonGroupItem>
        <ButtonGroupItem id="text">{t('upload_mode_text')}</ButtonGroupItem>
      </ButtonGroup>
    );
  }

  return (
    <section className={cn(
      isModal && '',
      props.variant === 'page' && panelStyles({ tone: 'strong' }),
      isDashboard && 'overflow-hidden rounded-lg border border-ink-200 bg-white shadow-xs',
    )}
    >
      <div className={cn('flex flex-col gap-4', isDashboard && 'px-6 py-6 sm:px-7')}>
        {!isModal && (
          <div className="max-w-2xl">
            <div className="flex items-center gap-3">
              <div className={cn(
                'rounded-2xl p-3 text-brand-600 shadow-xs',
                isDashboard ? 'rounded-md bg-brand-50 ring-1 ring-brand-100' : 'bg-white',
              )}
              >
                <UploadCloud02 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-ink-950">{t('upload_title')}</h2>
                <p className="mt-2 text-sm leading-6 text-ink-600">{t('upload_description')}</p>
              </div>
            </div>

            <div className="mt-4">
              {renderUploadModeGroup()}
            </div>
          </div>
        )}

        {isModal && (
          renderUploadModeGroup()
        )}
      </div>

      <form className={cn(isModal ? 'mt-4 space-y-4' : 'mt-6 space-y-5', isDashboard && 'border-t border-ink-100 px-6 py-6 sm:px-7')} onSubmit={handleSubmit}>
        {state.mode === 'text' && (
          <Input
            label={t('title_label')}
            maxLength={200}
            onChange={value => dispatch({ type: 'set_title', value })}
            placeholder={t('text_title_placeholder')}
            type="text"
            value={state.title}
          />
        )}

        {state.mode === 'pdf' && (
          <div className="space-y-4">
            <FileUploadDropZone
              key={state.fileInputKey}
              accept="application/pdf,.pdf"
              allowsMultiple={false}
              className={cn(
                isDashboard && 'rounded-lg border border-dashed border-ink-300 bg-ink-25/80 px-8 py-10',
              )}
              hint={t('pdf_help')}
              maxSize={10 * 1024 * 1024}
              onDropFiles={(files) => {
                dispatch({ type: 'set_client_error', value: null });
                dispatch({ type: 'set_selected_file', file: files[0] ?? null });
              }}
              onDropUnacceptedFiles={() => {
                dispatch({ type: 'set_client_error', value: t('upload_validation_error') });
                dispatch({ type: 'set_selected_file', file: null });
              }}
              onSizeLimitExceed={() => {
                dispatch({ type: 'set_client_error', value: t('upload_validation_error') });
                dispatch({ type: 'set_selected_file', file: null });
              }}
            />
            {state.selectedFile && (
              <p className={cn(
                'mt-4 rounded-lg bg-brand-25 px-4 py-3 text-sm text-ink-600',
                isDashboard && 'mx-auto max-w-sm text-center',
              )}
              >
                {t('selected_file')}
                :
                {' '}
                {state.selectedFile.name}
              </p>
            )}
          </div>
        )}

        {state.mode === 'url' && (
          <Input
            label={t('url_label')}
            onChange={value => dispatch({ type: 'set_url', value })}
            placeholder="https://example.com/article"
            type="url"
            value={state.url}
          />
        )}

        {state.mode === 'text' && (
          <label className="block text-sm text-ink-700">
            <span className={fieldLabelStyles()}>{t('text_label')}</span>
            <textarea
              className={textareaStyles()}
              maxLength={100000}
              onChange={event => dispatch({ type: 'set_text_content', value: event.target.value })}
              placeholder={t('text_placeholder')}
              value={state.textContent}
            />
          </label>
        )}

        {(state.clientError || props.errorMessage) && (
          <p className="rounded-2xl border border-error-100 bg-error-50 px-4 py-3 text-sm text-error-700" role="alert">
            {state.clientError ?? props.errorMessage}
          </p>
        )}

        {props.statusMessage && (
          <p className="rounded-2xl border border-success-100 bg-success-50 px-4 py-3 text-sm text-success-700" aria-live="polite">
            {props.statusMessage}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button disabled={props.isSubmitting} type="submit" variant="primary">
            {props.isSubmitting ? t('upload_loading') : t('upload_submit')}
          </Button>
        </div>
      </form>
    </section>
  );
}
