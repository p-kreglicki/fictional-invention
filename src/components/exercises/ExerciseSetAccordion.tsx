'use client';

import type { ExerciseCardItem } from './ExerciseCards';
import type { ExerciseLatestResponse, ExerciseSet, SubmitResponseSuccess } from '@/validations/ResponseValidation';
import { Trash01 } from '@untitledui/icons';
import { useLocale, useTranslations } from 'next-intl';
import { Button as AriaButton, Disclosure, DisclosureGroup, DisclosurePanel, Heading } from 'react-aria-components';
import { Badge } from '@/components/ui/base/badges/badges';
import { panelStyles } from '@/components/ui/styles';
import { ButtonUtility } from '@/components/untitled/base/buttons/button-utility';
import { ExerciseCards } from './ExerciseCards';

type ExerciseSetAccordionProps = {
  apiBasePath: string;
  onDeleteRequest: (_set: ExerciseSet) => void;
  onExerciseSyncRequested?: (_exerciseId: string) => Promise<SubmitResponseSuccess | null>;
  onExerciseUpdated: (_input: {
    exerciseId: string;
    latestResponse: ExerciseLatestResponse;
    timesAttempted: number;
    averageScore: number | null;
  }) => void;
  sets: ExerciseSet[];
};

function getDifficultyLabel(input: {
  difficulty: ExerciseCardItem['difficulty'];
  t: ReturnType<typeof useTranslations<'DashboardExercisesPage'>>;
}) {
  switch (input.difficulty) {
    case 'beginner':
      return input.t('difficulty_beginner');
    case 'intermediate':
      return input.t('difficulty_intermediate');
    case 'advanced':
      return input.t('difficulty_advanced');
    default:
      return null;
  }
}

function formatSetTimestamp(input: {
  locale: string;
  value: string;
}) {
  return new Intl.DateTimeFormat(input.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(input.value));
}

function getHeaderTitle(set: ExerciseSet, t: ReturnType<typeof useTranslations<'DashboardExercisesPage'>>) {
  if (set.sourceDocuments.length > 0) {
    return set.sourceDocuments[0]!.title;
  }

  return set.topicFocus ?? getDifficultyLabel({
    difficulty: set.difficulty,
    t,
  }) ?? t('set_untitled');
}

export function ExerciseSetAccordion(props: ExerciseSetAccordionProps) {
  const locale = useLocale();
  const t = useTranslations('DashboardExercisesPage');
  const defaultExpandedSetId = props.sets.find(set => set.status === 'completed')?.id ?? props.sets[0]?.id;

  if (props.sets.length === 0) {
    return (
      <section className={panelStyles()}>
        <h2 className="text-base font-semibold text-ink-900">{t('results_title')}</h2>
        <p className="mt-2 text-sm text-ink-600">{t('results_empty')}</p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-ink-900">{t('results_title')}</h2>

      <DisclosureGroup
        allowsMultipleExpanded
        className="space-y-3"
        defaultExpandedKeys={defaultExpandedSetId ? new Set([defaultExpandedSetId]) : undefined}
      >
        {props.sets.map((set) => {
          const headerTitle = getHeaderTitle(set, t);
          const createdTimestamp = formatSetTimestamp({
            locale,
            value: set.createdAt,
          });
          const canDelete = set.status === 'completed' || set.status === 'failed';

          return (
            <Disclosure
              key={set.id}
              id={set.id}
              className={panelStyles({ tone: 'muted', className: 'overflow-hidden rounded-3xl border border-ink-200 bg-white p-5 shadow-xs' })}
            >
              <div className="flex items-center justify-between gap-4 px-2 py-2">
                <Heading className="min-w-0 flex-1 pr-2">
                  <AriaButton
                    slot="trigger"
                    className="w-full justify-start rounded-none border-0 bg-transparent px-0 py-0 text-left text-ink-900 shadow-none hover:bg-transparent"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-xl leading-8 font-semibold tracking-[-0.02em] text-ink-950">
                          {headerTitle}
                        </span>
                        <Badge color="brand" size="md" type="pill-color">
                          <span className="flex items-center gap-1.5">
                            <span>{t('set_exercise_count_badge', { count: set.generatedCount })}</span>
                          </span>
                        </Badge>
                      </span>

                      <span className="block text-base text-xs leading-6 font-normal tracking-[-0.01em] text-ink-500">
                        {t('set_created_summary', { date: createdTimestamp })}
                      </span>
                    </span>
                  </AriaButton>
                </Heading>

                <ButtonUtility
                  className="size-14 shrink-0 rounded-2xl bg-white p-0 text-fg-quaternary shadow-xs ring-1 ring-primary ring-inset"
                  icon={Trash01}
                  isDisabled={!canDelete}
                  onClick={() => {
                    props.onDeleteRequest(set);
                  }}
                  tooltip={t('delete_set_button')}
                />
              </div>

              <DisclosurePanel className="overflow-hidden px-2 pt-4 pb-8">
                {set.errorMessage && (
                  <p className="mb-4 rounded-2xl border border-error-100 bg-error-50 px-3 py-2 text-sm text-error-700">
                    {set.errorMessage}
                  </p>
                )}

                <ExerciseCards
                  apiBasePath={props.apiBasePath}
                  exercises={set.exercises}
                  heading={null}
                  onExerciseSyncRequested={props.onExerciseSyncRequested}
                  onExerciseUpdated={props.onExerciseUpdated}
                  showEmptyState={false}
                />
              </DisclosurePanel>
            </Disclosure>
          );
        })}
      </DisclosureGroup>
    </section>
  );
}
