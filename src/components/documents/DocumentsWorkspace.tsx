'use client';

import type { DocumentListItem } from '@/validations/DocumentValidation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { createPollingGate } from '@/components/exercises/PollingGate';
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

  return (
    <div className="space-y-6 py-6">
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
