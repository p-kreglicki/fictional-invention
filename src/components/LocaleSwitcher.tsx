'use client';

import { ChevronDown, Globe01 } from '@untitledui/icons';
import { useLocale, useTranslations } from 'next-intl';
import { Button, ListBox, ListBoxItem, Popover, Select, SelectionIndicator, SelectValue } from 'react-aria-components';
import { usePathname, useRouter } from '@/libs/I18nNavigation';
import { routing } from '@/libs/I18nRouting';
import { cn } from '@/utils/cn';

export function LocaleSwitcher(props?: {
  chevronClassName?: string;
  iconClassName?: string;
  iconSlotClassName?: string;
  indicatorClassName?: string;
  itemClassName?: string;
  popoverClassName?: string;
  triggerClassName?: string;
  valueClassName?: string;
}) {
  const t = useTranslations('LocaleSwitcher');
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const displayNames = new Intl.DisplayNames([locale], { type: 'language' });
  const localeOptions = routing.locales.map(value => ({
    label: displayNames.of(value) ?? value.toUpperCase(),
    value,
  }));

  function handleChange(selectedKey: React.Key | null) {
    if (selectedKey == null) {
      return;
    }

    const newLocale = String(selectedKey);

    if (newLocale === locale) {
      return;
    }

    const { search } = window.location;
    router.push(`${pathname}${search}`, { locale: newLocale, scroll: false });
  }

  return (
    <Select
      aria-label={t('change_language')}
      selectedKey={locale}
      onSelectionChange={handleChange}
      className="w-full"
    >
      <Button className={cn('flex w-full items-center px-3 py-2 text-left transition focus:outline-none', props?.triggerClassName)}>
        <span className={cn('mr-2 flex size-5 shrink-0 items-center justify-start', props?.iconSlotClassName)}>
          <Globe01 className={cn('h-5 w-5 shrink-0', props?.iconClassName)} />
        </span>
        <SelectValue className={cn('min-w-0 flex-1 truncate', props?.valueClassName)}>
          {({ selectedText }) => selectedText || t('change_language')}
        </SelectValue>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-400', props?.chevronClassName)} />
      </Button>

      <Popover className={cn('mt-2 min-w-[var(--trigger-width)] overflow-hidden rounded-2xl border border-ink-200 bg-white p-1 shadow-lg', props?.popoverClassName)}>
        <ListBox className="outline-none">
          {localeOptions.map(option => (
            <ListBoxItem
              id={option.value}
              key={option.value}
              textValue={option.label}
              className={cn('flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-700 transition outline-none data-[focused]:bg-ink-50 data-[selected]:text-ink-900', props?.itemClassName)}
            >
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-ink-200 px-2 text-[11px] font-semibold text-ink-500 uppercase">
                {option.value}
              </span>
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              <SelectionIndicator className={cn('h-4 w-4 text-brand-600', props?.indicatorClassName)} />
            </ListBoxItem>
          ))}
        </ListBox>
      </Popover>
    </Select>
  );
}
