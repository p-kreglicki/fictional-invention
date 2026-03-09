'use client';

import type { DocumentListItem } from '@/validations/DocumentValidation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { createPollingGate } from '@/components/exercises/PollingGate';
import { DocumentListItemSchema } from '@/validations/DocumentValidation';

const DocumentsResponseSchema = z.object({
  documents: z.array(DocumentListItemSchema),
});

type UseDocumentsWorkspaceOptions = {
  onUploadSuccess?: (input: {
    nextDocuments: DocumentListItem[];
    previousDocuments: DocumentListItem[];
  }) => Promise<void> | void;
  onDeleteSuccess?: (input: {
    deletedDocumentId: string;
    nextDocuments: DocumentListItem[];
  }) => Promise<void> | void;
};

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

export function useDocumentsWorkspace(props: UseDocumentsWorkspaceOptions = {}) {
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
  const [uploadResetKey, setUploadResetKey] = useState(0);

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

    return parsed.data.documents;
  }

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      setIsBootstrapping(true);
      setErrorMessage(null);

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
      const previousDocuments = documents;
      const nextDocuments = await refreshDocuments();
      setUploadResetKey(current => current + 1);
      await props.onUploadSuccess?.({
        nextDocuments,
        previousDocuments,
      });
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
      const previousDocuments = documents;
      const nextDocuments = await refreshDocuments();
      setUploadResetKey(current => current + 1);
      await props.onUploadSuccess?.({
        nextDocuments,
        previousDocuments,
      });
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
      const previousDocuments = documents;
      const nextDocuments = await refreshDocuments();
      setUploadResetKey(current => current + 1);
      await props.onUploadSuccess?.({
        nextDocuments,
        previousDocuments,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('upload_error'));
    } finally {
      setIsUploading(false);
    }
  }

  async function confirmDelete() {
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
      const deletedDocumentId = documentToDelete.id;
      const nextDocuments = await refreshDocuments();
      await props.onDeleteSuccess?.({
        deletedDocumentId,
        nextDocuments,
      });
    } catch (error) {
      setDeleteErrorMessage(error instanceof Error ? error.message : t('delete_error'));
    } finally {
      setIsDeleting(false);
    }
  }

  return {
    documents,
    isBootstrapping,
    isDeleting,
    isUploading,
    statusMessage,
    errorMessage,
    deleteErrorMessage,
    documentToDelete,
    uploadResetKey,
    clearDeleteErrorMessage: () => {
      setDeleteErrorMessage(null);
    },
    confirmDelete,
    refreshDocuments,
    setDocumentToDelete,
    submitPdf,
    submitText,
    submitUrl,
  };
}
