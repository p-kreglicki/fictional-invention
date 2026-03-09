'use client';

import type { PdfUploadSessionItem } from './useDocumentsWorkspace';
import { UploadCloud02 } from '@untitledui/icons';
import { useTranslations } from 'next-intl';
import { useEffect, useReducer } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { fieldLabelStyles, panelStyles, textareaStyles } from '@/components/ui/styles';
import { FileUpload } from '@/components/untitled/application/file-upload/file-upload-base';
import { ButtonGroup, ButtonGroupItem } from '@/components/untitled/base/button-group/button-group';
import { cn } from '@/utils/cn';

type UploadMode = 'pdf' | 'url' | 'text';

type DocumentUploadPanelProps = {
  pdfUploads: PdfUploadSessionItem[];
  isSubmitting: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
  resetKey?: number;
  variant?: 'page' | 'modal' | 'dashboard';
  onDismissPdfUpload: (uploadId: string) => void;
  onQueuePdfFiles: (files: FileList) => void;
  onRetryPdfUpload: (uploadId: string) => Promise<void> | void;
  onSubmitUrl: (input: { url: string; title: string }) => Promise<void>;
  onSubmitText: (input: { title: string; content: string }) => Promise<void>;
};

type UploadFormState = {
  mode: UploadMode;
  title: string;
  url: string;
  textContent: string;
  clientError: string | null;
  fileInputKey: number;
};

type UploadFormAction
  = | { type: 'set_mode'; mode: UploadMode }
    | { type: 'set_title'; value: string }
    | { type: 'set_url'; value: string }
    | { type: 'set_text_content'; value: string }
    | { type: 'set_client_error'; value: string | null }
    | { type: 'reset_form' };

function createInitialUploadFormState(): UploadFormState {
  return {
    mode: 'pdf',
    title: '',
    url: '',
    textContent: '',
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
        clientError: null,
        fileInputKey: state.fileInputKey + 1,
      };
  }
}

function getPdfUploadStatus(input: {
  item: PdfUploadSessionItem;
  t: ReturnType<typeof useTranslations>;
}) {
  if (input.item.phase === 'completed') {
    return {
      statusIcon: 'complete' as const,
      statusLabel: input.t('upload_status_completed'),
      hideProgress: false,
      progress: 100,
    };
  }

  if (input.item.phase === 'failed') {
    return {
      statusIcon: 'failed' as const,
      statusLabel: input.t('upload_status_failed'),
      hideProgress: true,
      progress: input.item.progress,
    };
  }

  if (input.item.phase === 'processing') {
    return {
      statusIcon: 'processing' as const,
      statusLabel: input.t('upload_status_processing'),
      hideProgress: false,
      progress: 100,
    };
  }

  if (input.item.phase === 'queued') {
    return {
      statusIcon: 'uploading' as const,
      statusLabel: input.t('upload_status_queued'),
      hideProgress: false,
      progress: 0,
    };
  }

  return {
    statusIcon: 'uploading' as const,
    statusLabel: input.t('upload_status_uploading'),
    hideProgress: false,
    progress: input.item.progress,
  };
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

        {isModal && renderUploadModeGroup()}
      </div>

      <form className={cn(isModal ? 'mt-4 space-y-4' : 'mt-6 space-y-5', isDashboard && 'border-t border-ink-100 px-6 py-6 sm:px-7')} onSubmit={handleSubmit}>
        {state.mode === 'pdf' && (
          <FileUpload.Root className="space-y-4">
            <FileUpload.DropZone
              key={state.fileInputKey}
              accept="application/pdf,.pdf"
              allowsMultiple
              className={cn(
                isDashboard && 'rounded-lg border border-dashed border-ink-300 bg-ink-25/80 px-8 py-10',
              )}
              hint={t('pdf_help')}
              isDisabled={props.isSubmitting}
              maxSize={10 * 1024 * 1024}
              onDropFiles={(files) => {
                dispatch({ type: 'set_client_error', value: null });
                props.onQueuePdfFiles(files);
              }}
              onDropUnacceptedFiles={() => {
                dispatch({ type: 'set_client_error', value: t('upload_validation_error') });
              }}
              onSizeLimitExceed={() => {
                dispatch({ type: 'set_client_error', value: t('upload_validation_error') });
              }}
            />

            {props.pdfUploads.length > 0 && (
              <FileUpload.List>
                {props.pdfUploads.map((upload) => {
                  const status = getPdfUploadStatus({ item: upload, t });
                  const canDismiss = upload.phase !== 'uploading' && upload.phase !== 'processing';

                  return (
                    <FileUpload.ListItemProgressBar
                      key={upload.id}
                      className={cn(isDashboard && 'rounded-lg')}
                      complete={upload.phase === 'completed'}
                      deleteLabel={t('upload_dismiss')}
                      failed={upload.phase === 'failed'}
                      hideProgress={status.hideProgress}
                      name={upload.name}
                      onDelete={canDismiss ? () => props.onDismissPdfUpload(upload.id) : undefined}
                      onRetry={upload.phase === 'failed' ? () => props.onRetryPdfUpload(upload.id) : undefined}
                      progress={status.progress}
                      retryLabel={t('upload_retry')}
                      size={upload.size}
                      statusIcon={status.statusIcon}
                      statusLabel={status.statusLabel}
                      type="pdf"
                    />
                  );
                })}
              </FileUpload.List>
            )}
          </FileUpload.Root>
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
          <>
            <Input
              label={t('title_label')}
              maxLength={200}
              onChange={value => dispatch({ type: 'set_title', value })}
              placeholder={t('text_title_placeholder')}
              type="text"
              value={state.title}
            />
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
          </>
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

        {state.mode !== 'pdf' && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button disabled={props.isSubmitting} type="submit" variant="primary">
              {props.isSubmitting ? t('upload_loading') : t('upload_submit')}
            </Button>
          </div>
        )}
      </form>
    </section>
  );
}
