'use client';

import type { DocumentListItem } from '@/validations/DocumentValidation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { z } from 'zod';
import { createPollingGate } from '@/components/exercises/PollingGate';
import { DocumentListItemSchema } from '@/validations/DocumentValidation';

const DocumentsResponseSchema = z.object({
  documents: z.array(DocumentListItemSchema),
});

type UploadResponsePayload = {
  documentId?: string;
  error?: string;
  message?: string;
};

export type PdfUploadPhase = 'queued' | 'uploading' | 'processing' | 'completed' | 'failed';

export type PdfUploadSessionItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  progress: number;
  phase: PdfUploadPhase;
  errorMessage: string | null;
  documentId: string | null;
};

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

type WorkspaceTranslations = ReturnType<typeof useTranslations>;

type XhrRequestHandle = {
  abort: () => void;
  promise: Promise<{
    ok: boolean;
    payload: UploadResponsePayload;
    status: number;
  }>;
};

function getUploadErrorMessage(input: {
  payload: { error?: string; message?: string };
  t: WorkspaceTranslations;
}) {
  if (input.payload.message) {
    return input.payload.message;
  }

  if (input.payload.error === 'VALIDATION_FAILED') {
    return input.t('upload_validation_error');
  }

  return input.t('upload_error');
}

function createPdfUploadSessionItem(file: File): PdfUploadSessionItem {
  return {
    id: crypto.randomUUID(),
    file,
    name: file.name,
    size: file.size,
    progress: 0,
    phase: 'queued',
    errorMessage: null,
    documentId: null,
  };
}

function getProgressPercentage(loaded: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.min(99, Math.max(0, Math.round((loaded / total) * 100)));
}

function parseUploadPayload(responseText: string): UploadResponsePayload {
  if (!responseText) {
    return {};
  }

  try {
    return JSON.parse(responseText) as UploadResponsePayload;
  } catch {
    return {};
  }
}

function createPdfUploadRequest(input: {
  apiBasePath: string;
  file: File;
  onProgress: (progress: number) => void;
}): XhrRequestHandle {
  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  formData.set('file', input.file);

  const promise = new Promise<{
    ok: boolean;
    payload: UploadResponsePayload;
    status: number;
  }>((resolve, reject) => {
    xhr.open('POST', `${input.apiBasePath}/documents/upload`);
    xhr.responseType = 'text';

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) {
        return;
      }

      input.onProgress(getProgressPercentage(event.loaded, event.total));
    });

    xhr.addEventListener('load', () => {
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        payload: parseUploadPayload(xhr.responseText),
        status: xhr.status,
      });
    });

    xhr.addEventListener('error', () => {
      reject(new Error('upload_error'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('upload_aborted'));
    });

    xhr.send(formData);
  });

  return {
    abort: () => {
      xhr.abort();
    },
    promise,
  };
}

function updatePdfUploadItem(
  items: PdfUploadSessionItem[],
  uploadId: string,
  updater: (item: PdfUploadSessionItem) => PdfUploadSessionItem,
) {
  return items.map(item => (item.id === uploadId ? updater(item) : item));
}

export function useDocumentsWorkspace(props: UseDocumentsWorkspaceOptions = {}) {
  const locale = useLocale();
  const t = useTranslations('DashboardContentPage');
  const apiBasePath = `/${locale}/api`;
  const pollingGateRef = useRef(createPollingGate());
  const documentsRef = useRef<DocumentListItem[]>([]);
  const pdfUploadItemsRef = useRef<PdfUploadSessionItem[]>([]);
  const currentPdfUploadRef = useRef<{ uploadId: string; abort: () => void } | null>(null);
  const isMountedRef = useRef(true);
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [pdfUploadItems, setPdfUploadItems] = useState<PdfUploadSessionItem[]>([]);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSubmittingNonPdf, setIsSubmittingNonPdf] = useState(false);
  const [isPdfQueueRunning, setIsPdfQueueRunning] = useState(false);
  const [isRetryingPdfReplacement, setIsRetryingPdfReplacement] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<DocumentListItem | null>(null);
  const [uploadResetKey, setUploadResetKey] = useState(0);

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    pdfUploadItemsRef.current = pdfUploadItems;
  }, [pdfUploadItems]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      currentPdfUploadRef.current?.abort();
    };
  }, []);

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

  async function deleteDocumentById(documentId: string) {
    const response = await fetch(`${apiBasePath}/documents/${documentId}`, {
      method: 'DELETE',
    });
    const payload = await response.json() as {
      error?: string;
      message?: string;
      success?: boolean;
    };

    if (!response.ok || !payload.success) {
      throw new Error(payload.message ?? t('delete_error'));
    }
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

  const reconcilePdfUploads = useEffectEvent(() => {
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setPdfUploadItems((currentItems) => {
      let changed = false;

      const nextItems = currentItems.map((item) => {
        if (!item.documentId || item.phase === 'queued' || item.phase === 'uploading') {
          return item;
        }

        const linkedDocument = documents.find(document => document.id === item.documentId);
        if (!linkedDocument) {
          return item;
        }

        if (linkedDocument.status === 'ready') {
          if (item.phase === 'completed' && item.errorMessage === null) {
            return item;
          }

          changed = true;
          return {
            ...item,
            progress: 100,
            phase: 'completed' as const,
            errorMessage: null,
          };
        }

        if (linkedDocument.status === 'failed') {
          const nextErrorMessage = linkedDocument.errorMessage ?? t('upload_error');

          if (item.phase === 'failed' && item.errorMessage === nextErrorMessage) {
            return item;
          }

          changed = true;
          return {
            ...item,
            progress: 100,
            phase: 'failed' as const,
            errorMessage: nextErrorMessage,
          };
        }

        if (item.phase === 'processing') {
          return item;
        }

        changed = true;
        return {
          ...item,
          progress: 100,
          phase: 'processing' as const,
          errorMessage: null,
        };
      });

      return changed ? nextItems : currentItems;
    });
  });

  useEffect(() => {
    reconcilePdfUploads();
  }, [documents, reconcilePdfUploads]);

  const startNextQueuedPdfUpload = useEffectEvent((nextQueuedItem: PdfUploadSessionItem) => {
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setPdfUploadItems(currentItems => updatePdfUploadItem(currentItems, nextQueuedItem.id, item => ({
      ...item,
      phase: 'uploading',
      progress: 0,
      errorMessage: null,
    })));

    const request = createPdfUploadRequest({
      apiBasePath,
      file: nextQueuedItem.file,
      onProgress: (progress) => {
        if (!isMountedRef.current) {
          return;
        }

        // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
        setPdfUploadItems(currentItems => updatePdfUploadItem(currentItems, nextQueuedItem.id, item => ({
          ...item,
          progress,
        })));
      },
    });

    currentPdfUploadRef.current = {
      uploadId: nextQueuedItem.id,
      abort: request.abort,
    };

    void request.promise.then(async ({ ok, payload }) => {
      if (!isMountedRef.current) {
        return;
      }

      if (!ok || typeof payload.documentId !== 'string') {
        throw new Error(getUploadErrorMessage({ payload, t }));
      }

      setPdfUploadItems(currentItems => updatePdfUploadItem(currentItems, nextQueuedItem.id, item => ({
        ...item,
        progress: 100,
        phase: 'processing',
        documentId: payload.documentId ?? null,
        errorMessage: null,
      })));

      const previousDocuments = documentsRef.current;
      const nextDocuments = await refreshDocuments();
      await props.onUploadSuccess?.({
        nextDocuments,
        previousDocuments,
      });
    }).catch((error: unknown) => {
      if (!isMountedRef.current) {
        return;
      }

      if (error instanceof Error && error.message === 'upload_aborted') {
        return;
      }

      const nextErrorMessage = error instanceof Error ? error.message : t('upload_error');

      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
      setPdfUploadItems(currentItems => updatePdfUploadItem(currentItems, nextQueuedItem.id, item => ({
        ...item,
        phase: 'failed',
        errorMessage: nextErrorMessage,
      })));
    }).finally(() => {
      currentPdfUploadRef.current = null;
    });
  });

  const stopPdfQueue = useEffectEvent(() => {
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect
    setIsPdfQueueRunning(false);
  });

  useEffect(() => {
    if (!isPdfQueueRunning || currentPdfUploadRef.current) {
      return;
    }

    const nextQueuedItem = pdfUploadItems.find(item => item.phase === 'queued');

    if (!nextQueuedItem) {
      stopPdfQueue();
      return;
    }

    startNextQueuedPdfUpload(nextQueuedItem);
  }, [isPdfQueueRunning, pdfUploadItems, startNextQueuedPdfUpload, stopPdfQueue]);

  async function submitUrl(input: { url: string; title: string }) {
    setIsSubmittingNonPdf(true);
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
      const previousDocuments = documentsRef.current;
      const nextDocuments = await refreshDocuments();
      setUploadResetKey(current => current + 1);
      await props.onUploadSuccess?.({
        nextDocuments,
        previousDocuments,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('upload_error'));
    } finally {
      setIsSubmittingNonPdf(false);
    }
  }

  async function submitText(input: { title: string; content: string }) {
    setIsSubmittingNonPdf(true);
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
      const previousDocuments = documentsRef.current;
      const nextDocuments = await refreshDocuments();
      setUploadResetKey(current => current + 1);
      await props.onUploadSuccess?.({
        nextDocuments,
        previousDocuments,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('upload_error'));
    } finally {
      setIsSubmittingNonPdf(false);
    }
  }

  async function confirmDelete() {
    if (!documentToDelete) {
      return;
    }

    setIsDeleting(true);
    setDeleteErrorMessage(null);

    try {
      await deleteDocumentById(documentToDelete.id);
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
    pdfUploadItems,
    isBootstrapping,
    isDeleting,
    isUploading: isSubmittingNonPdf || isRetryingPdfReplacement || currentPdfUploadRef.current !== null,
    statusMessage,
    errorMessage,
    deleteErrorMessage,
    documentToDelete,
    uploadResetKey,
    clearDeleteErrorMessage: () => {
      setDeleteErrorMessage(null);
    },
    clearStatusMessage: () => {
      setStatusMessage(null);
    },
    confirmDelete,
    dismissPdfUpload: (uploadId: string) => {
      if (currentPdfUploadRef.current?.uploadId === uploadId) {
        return;
      }

      setPdfUploadItems(currentItems => currentItems.filter(item => item.id !== uploadId));
    },
    queuePdfFiles: (files: FileList | File[]) => {
      setStatusMessage(null);
      setErrorMessage(null);
      const nextItems = Array.from(files).map(createPdfUploadSessionItem);
      setPdfUploadItems(currentItems => [...currentItems, ...nextItems]);
    },
    refreshDocuments,
    retryPdfUpload: async (uploadId: string) => {
      const targetUpload = pdfUploadItemsRef.current.find(item => item.id === uploadId);
      if (!targetUpload) {
        return;
      }

      setStatusMessage(null);
      setErrorMessage(null);

      if (targetUpload.documentId) {
        setIsRetryingPdfReplacement(true);
        setPdfUploadItems(currentItems => updatePdfUploadItem(currentItems, uploadId, item => ({
          ...item,
          phase: 'processing',
          errorMessage: null,
        })));

        try {
          await deleteDocumentById(targetUpload.documentId);
          const nextDocuments = await refreshDocuments();
          await props.onDeleteSuccess?.({
            deletedDocumentId: targetUpload.documentId,
            nextDocuments,
          });
        } catch (error) {
          const nextErrorMessage = error instanceof Error ? error.message : t('delete_error');
          setPdfUploadItems(currentItems => updatePdfUploadItem(currentItems, uploadId, item => ({
            ...item,
            phase: 'failed',
            errorMessage: nextErrorMessage,
          })));
          setIsRetryingPdfReplacement(false);
          return;
        }

        setIsRetryingPdfReplacement(false);
      }

      setPdfUploadItems(currentItems => updatePdfUploadItem(currentItems, uploadId, item => ({
        ...item,
        progress: 0,
        phase: 'queued',
        errorMessage: null,
        documentId: null,
      })));
      setIsPdfQueueRunning(true);
    },
    setDocumentToDelete,
    startPdfUploads: () => {
      setStatusMessage(null);
      setErrorMessage(null);
      setIsPdfQueueRunning(true);
    },
    submitText,
    submitUrl,
  };
}
