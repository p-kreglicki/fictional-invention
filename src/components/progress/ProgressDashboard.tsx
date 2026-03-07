'use client';

import type {
  ProgressHistoryItem,
  ProgressSourceDocument,
  ScoreTrendPoint,
} from '@/validations/ResponseValidation';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Link } from '@/libs/I18nNavigation';
import { ResponsesHistoryResponseSchema } from '@/validations/ResponseValidation';
import { ProgressFilters } from './ProgressFilters';
import { ProgressHistoryList } from './ProgressHistoryList';
import { ScoreTrendChart } from './ScoreTrendChart';

type ProgressState = {
  items: ProgressHistoryItem[];
  availableDocuments: ProgressSourceDocument[];
  averageScore: number | null;
  points: ScoreTrendPoint[];
  nextCursor: string | null;
};

const initialState: ProgressState = {
  items: [],
  availableDocuments: [],
  averageScore: null,
  points: [],
  nextCursor: null,
};

export function ProgressDashboard() {
  const locale = useLocale();
  const t = useTranslations('DashboardProgressPage');
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [state, setState] = useState<ProgressState>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadHistory(input?: {
    cursor?: string;
    append?: boolean;
    documentId?: string;
  }) {
    const params = new URLSearchParams();
    if (input?.cursor) {
      params.set('cursor', input.cursor);
    }
    params.set('limit', '20');
    if (input?.documentId) {
      params.set('documentId', input.documentId);
    }

    const response = await fetch(`/${locale}/api/responses?${params.toString()}`);
    const payload = await response.json() as unknown;
    const parsed = ResponsesHistoryResponseSchema.safeParse(payload);

    if (!response.ok || !parsed.success) {
      throw new Error('history_failed');
    }

    setState(current => ({
      items: input?.append ? [...current.items, ...parsed.data.items] : parsed.data.items,
      availableDocuments: parsed.data.availableDocuments,
      averageScore: parsed.data.trend.averageScore,
      points: parsed.data.trend.points,
      nextCursor: parsed.data.pageInfo.nextCursor,
    }));
  }

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        await loadHistory({
          documentId: selectedDocumentId || undefined,
        });
      } catch {
        if (!active) {
          return;
        }

        setErrorMessage(t('history_error'));
        setState(initialState);
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [locale, selectedDocumentId, t]);

  async function handleLoadMore() {
    if (!state.nextCursor) {
      return;
    }

    setIsLoadingMore(true);

    try {
      await loadHistory({
        append: true,
        cursor: state.nextCursor,
        documentId: selectedDocumentId || undefined,
      });
    } catch {
      setErrorMessage(t('history_error'));
    } finally {
      setIsLoadingMore(false);
    }
  }

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
            {t('primary_cta')}
          </Link>
          <Link
            href="/dashboard/content/"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
          >
            {t('secondary_cta')}
          </Link>
        </div>
      </section>

      <ProgressFilters
        availableDocuments={state.availableDocuments}
        onDocumentChange={setSelectedDocumentId}
        selectedDocumentId={selectedDocumentId}
      />

      {isLoading && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          {t('loading')}
        </section>
      )}

      {!isLoading && errorMessage && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {errorMessage}
        </section>
      )}

      {!isLoading && !errorMessage && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <ProgressHistoryList
            isLoadingMore={isLoadingMore}
            items={state.items}
            nextCursor={state.nextCursor}
            onLoadMore={handleLoadMore}
          />
          <ScoreTrendChart averageScore={state.averageScore} points={state.points} />
        </div>
      )}
    </div>
  );
}
