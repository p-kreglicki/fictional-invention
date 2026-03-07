'use client';

import type { DocumentListItem } from '@/validations/DocumentValidation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { createPollingGate } from '@/components/exercises/PollingGate';
import { Link } from '@/libs/I18nNavigation';
import { DocumentListItemSchema } from '@/validations/DocumentValidation';
import { DeleteDocumentDialog } from './DeleteDocumentDialog';
import { DocumentsLibrary } from './DocumentsLibrary';
import { DocumentUploadPanel } from './DocumentUploadPanel';

const DocumentsResponseSchema = z.object({
  documents: z.array(DocumentListItemSchema),
});

function getUploadErrorMessage(input: {
  payload: { error?: string; message?: string };
  t: ReturnType<typeof useTranslations>;
}) {
  if (input.payload.message) {
    return input.payload.message;
  }

  if (input.payload.error === 'VALIDATION_FAILED') {
    return input.t('upload_validation_error');
  }

  return input.t('upload_error');
}

export function DocumentsWorkspace() {
  const locale = useLocale();
  const t = useTranslations('DashboardContentPage');
  const apiBasePath = `/${locale}/api`;
  const pollingGateRef = useRef(createPollingGate());
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<DocumentListItem | null>(null);

  async function refreshDocuments() {
    const response = await fetch(`${apiBasePath}/documents`);
    const payload = await response.json() as unknown;

    if (!response.ok) {
      throw new Error('documents_failed');
    }

    const parsed = DocumentsResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error('documents_invalid');
    }

    setDocuments(parsed.data.documents);
  }

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        await refreshDocuments();
      } catch {
        if (!active) {
          return;
        }

        setErrorMessage(t('bootstrap_error'));
      } finally {
        if (active) {
          setIsBootstrapping(false);
        }
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [apiBasePath, t]);

  const hasActiveDocuments = documents.some(document => (
    document.status === 'uploading' || document.status === 'processing'
  ));

  useEffect(() => {
    if (!hasActiveDocuments) {
      return undefined;
    }

    let active = true;

    async function pollDocuments() {
      if (!active || !pollingGateRef.current.tryEnter()) {
        return;
      }

      try {
        await refreshDocuments();
      } catch {
        if (!active) {
          return;
        }

        setErrorMessage(t('polling_error'));
      } finally {
        pollingGateRef.current.leave();
      }
    }

    const interval = window.setInterval(() => {
      void pollDocuments();
    }, 2000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [hasActiveDocuments, t]);

  async function submitPdf(input: { file: File; title: string }) {
    setIsUploading(true);
    setStatusMessage(null);
    setErrorMessage(null);

    const formData = new FormData();
    formData.set('file', input.file);
    if (input.title) {
      formData.set('title', input.title);
    }

    try {
      const response = await fetch(`${apiBasePath}/documents/upload`, {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json() as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(getUploadErrorMessage({ payload, t }));
      }

      setStatusMessage(t('upload_accepted'));
      await refreshDocuments();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('upload_error'));
    } finally {
      setIsUploading(false);
    }
  }

  async function submitUrl(input: { url: string; title: string }) {
    setIsUploading(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`${apiBasePath}/documents/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'url',
          url: input.url,
          title: input.title || undefined,
        }),
      });
      const payload = await response.json() as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(getUploadErrorMessage({ payload, t }));
      }

      setStatusMessage(t('upload_accepted'));
      await refreshDocuments();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('upload_error'));
    } finally {
      setIsUploading(false);
    }
  }

  async function submitText(input: { title: string; content: string }) {
    setIsUploading(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(`${apiBasePath}/documents/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'text',
          title: input.title,
          content: input.content,
        }),
      });
      const payload = await response.json() as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(getUploadErrorMessage({ payload, t }));
      }

      setStatusMessage(t('upload_accepted'));
      await refreshDocuments();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('upload_error'));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete() {
    if (!documentToDelete) {
      return;
    }

    setIsDeleting(true);
    setDeleteErrorMessage(null);

    try {
      const response = await fetch(`${apiBasePath}/documents/${documentToDelete.id}`, {
        method: 'DELETE',
      });
      const payload = await response.json() as { error?: string; message?: string; success?: boolean };

      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? t('delete_error'));
      }

      setDocumentToDelete(null);
      await refreshDocuments();
    } catch (error) {
      setDeleteErrorMessage(error instanceof Error ? error.message : t('delete_error'));
    } finally {
      setIsDeleting(false);
    }
  }

  const readyDocumentsCount = documents.filter(document => document.status === 'ready').length;

  return (
    <div className="space-y-6 py-6">
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm font-medium tracking-[0.18em] text-slate-500 uppercase">
          {t('eyebrow')}
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{t('description')}</p>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/dashboard/exercises/"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            {readyDocumentsCount > 0 ? t('primary_cta_ready') : t('primary_cta_waiting')}
          </Link>
          <Link
            href="/dashboard/progress/"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
          >
            {t('secondary_cta')}
          </Link>
        </div>
      </section>

      <DocumentUploadPanel
        errorMessage={errorMessage}
        isSubmitting={isUploading}
        onSubmitPdf={submitPdf}
        onSubmitText={submitText}
        onSubmitUrl={submitUrl}
        statusMessage={statusMessage}
      />

      {isBootstrapping
        ? (
            <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
              {t('loading')}
            </section>
          )
        : (
            <DocumentsLibrary
              documents={documents}
              onDelete={(document) => {
                setDeleteErrorMessage(null);
                setDocumentToDelete(document);
              }}
            />
          )}

      <DeleteDocumentDialog
        document={documentToDelete}
        errorMessage={deleteErrorMessage}
        isDeleting={isDeleting}
        onCancel={() => {
          if (isDeleting) {
            return;
          }

          setDocumentToDelete(null);
          setDeleteErrorMessage(null);
        }}
        onConfirm={handleDelete}
      />
    </div>
  );
}
