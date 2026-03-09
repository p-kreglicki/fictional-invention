'use client';
import type { NavItemType } from '@/components/ui/application/app-navigation/config';
import { SignOutButton } from '@clerk/nextjs';
import { BarChartSquare02, BookOpen01, FileSearch03, LogOut01, TrendUp02, UserCircle } from '@untitledui/icons';
import { useTranslations } from 'next-intl';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { NavItemBase } from '@/components/ui/application/app-navigation/base-components/nav-item';
import { navItemClassNames } from '@/components/ui/application/app-navigation/base-components/nav-item-styles';
import { NavList } from '@/components/ui/application/app-navigation/base-components/nav-list';
import { usePathname } from '@/libs/I18nNavigation';
import { AppConfig } from '@/utils/AppConfig';
import { cx } from '@/utils/cx';

export function DashboardSidebarNav() {
  const t = useTranslations('DashboardLayout');
  const baseTemplateT = useTranslations('BaseTemplate');
  const pathname = usePathname();

  const primaryItems: NavItemType[] = [
    { href: '/dashboard/', icon: BarChartSquare02, label: t('dashboard_link') },
    { href: '/dashboard/content/', icon: FileSearch03, label: t('content_link') },
    { href: '/dashboard/exercises/', icon: BookOpen01, label: t('exercises_link') },
    { href: '/dashboard/progress/', icon: TrendUp02, label: t('progress_link') },
  ];
  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <div className="flex items-center gap-3 px-2 lg:px-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-500 text-white">
          <BookOpen01 className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-semibold text-secondary">{AppConfig.name}</p>
          <p className="text-sm text-tertiary">{baseTemplateT('description')}</p>
        </div>
      </div>

      <nav aria-label="Main navigation" className="mt-8 flex-1">
        <NavList activeUrl={pathname} className="mt-0 px-0 lg:px-0" items={primaryItems} />
      </nav>

      <div className="mt-8 border-t border-secondary pt-6">
        <nav aria-label="Utility navigation">
          <ul className="mt-0 flex flex-col px-0 lg:px-0">
            <li className="py-0.5">
              <NavItemBase
                current={pathname === '/dashboard/user-profile/'}
                href="/dashboard/user-profile/"
                icon={UserCircle}
                type="link"
              >
                {t('user_profile_link')}
              </NavItemBase>
            </li>

            <li className="py-0.5">
              <SignOutButton>
                <button className={cx(navItemClassNames.root, 'px-3 py-2 text-left')} type="button">
                  <span className={navItemClassNames.iconSlot}>
                    <LogOut01 aria-hidden="true" className={navItemClassNames.icon} />
                  </span>
                  <span className={navItemClassNames.label}>{t('sign_out')}</span>
                </button>
              </SignOutButton>
            </li>

            <li className="py-0.5">
              <LocaleSwitcher
                chevronClassName="size-4 shrink-0 text-fg-quaternary"
                iconClassName={navItemClassNames.icon}
                iconSlotClassName={navItemClassNames.iconSlot}
                indicatorClassName="size-4 text-brand-secondary"
                itemClassName="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-md font-medium text-secondary outline-hidden transition data-[focused]:bg-primary_hover data-[selected]:text-secondary_hover"
                popoverClassName="mt-2 min-w-[var(--trigger-width)] overflow-hidden rounded-xl bg-primary p-1 shadow-lg ring-1 ring-secondary"
                triggerClassName={cx(navItemClassNames.root, 'px-3 py-2')}
                valueClassName={navItemClassNames.label}
              />
            </li>
          </ul>
        </nav>

        <footer className="mt-6 border-t border-secondary px-3 pt-6 text-sm text-ink-500">
          {baseTemplateT.rich('footer_text', {
            year: new Date().getFullYear(),
            name: AppConfig.name,
            author: () => (
              <a
                href="https://nextjs-boilerplate.com"
                className="font-semibold text-brand-700 hover:text-brand-800"
              >
                Next.js Boilerplate
              </a>
            ),
          })}
        </footer>
      </div>
    </div>
  );
}
