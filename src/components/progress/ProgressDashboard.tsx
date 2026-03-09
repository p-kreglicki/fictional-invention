'use client';

import type {
  ProgressHistoryItem,
  ProgressSourceDocument,
  ScoreTrendPoint,
} from '@/validations/ResponseValidation';
import { ArrowRight, FileSearch03, TrendUp02 } from '@untitledui/icons';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { buttonStyles, eyebrowStyles, panelStyles } from '@/components/ui/styles';
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
      <section className={panelStyles({ tone: 'strong' })}>
        <p className={eyebrowStyles()}>
          {t('eyebrow')}
        </p>
        <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-semibold text-ink-950 sm:text-4xl">{t('title')}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-600">{t('description')}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-[1.5rem] border border-white/90 bg-white/80 p-4 shadow-xs">
              <TrendUp02 className="h-5 w-5 text-brand-600" />
              <p className="mt-4 text-xs font-semibold tracking-[0.18em] text-ink-500 uppercase">
                {t('trend_title')}
              </p>
            </article>
            <article className="rounded-[1.5rem] border border-white/90 bg-white/80 p-4 shadow-xs">
              <FileSearch03 className="h-5 w-5 text-brand-600" />
              <p className="mt-4 text-xs font-semibold tracking-[0.18em] text-ink-500 uppercase">
                {t('history_title')}
              </p>
            </article>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/dashboard/exercises/"
            className={buttonStyles({ tone: 'primary' })}
          >
            {t('primary_cta')}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/dashboard/content/"
            className={buttonStyles()}
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
        <section className={panelStyles({ className: 'text-sm text-ink-600' })}>
          {t('loading')}
        </section>
      )}

      {!isLoading && errorMessage && (
        <section className={panelStyles({ className: 'border-error-100 bg-error-50 text-sm text-error-700' })}>
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
