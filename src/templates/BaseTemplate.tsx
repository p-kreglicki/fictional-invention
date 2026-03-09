import { ArrowRight, BookOpen01 } from '@untitledui/icons';
import { useTranslations } from 'next-intl';
import { badgeStyles, panelStyles } from '@/components/ui/styles';
import { Surface } from '@/components/ui/Surface';
import { AppConfig } from '@/utils/AppConfig';

export const BaseTemplate = (props: {
  leftNav: React.ReactNode;
  rightNav?: React.ReactNode;
  children: React.ReactNode;
  variant?: 'marketing' | 'dashboard';
}) => {
  const t = useTranslations('BaseTemplate');
  const isDashboard = props.variant === 'dashboard';
  const wrapperClassName = isDashboard
    ? 'min-h-screen w-full px-4 py-5 sm:px-6 lg:px-8 lg:py-0'
    : 'min-h-screen w-full px-4 py-5 sm:px-6 lg:px-8 lg:py-8';

  return (
    <div className={wrapperClassName}>
      {isDashboard
        ? (
            <div className="grid min-h-[calc(100vh-2.5rem)] gap-6 lg:min-h-screen lg:grid-cols-[18rem_minmax(0,1fr)]">
              <aside className="relative flex border-r border-ink-100 bg-white px-5 py-6 sm:px-6 lg:sticky lg:top-0 lg:h-screen lg:px-8 lg:py-8">
                {props.leftNav}
              </aside>

              <div className="flex min-h-full flex-col gap-6">
                <main className={panelStyles({ className: 'overflow-hidden rounded-none border-none shadow-none' })}>
                  {props.children}
                </main>
              </div>
            </div>
          )
        : (
            <Surface className="flex min-h-[calc(100vh-2.5rem)] flex-col overflow-hidden px-0 py-0 lg:min-h-screen">
              <header className="border-b border-white/90 px-5 py-5 sm:px-7 sm:py-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm">
                        <BookOpen01 className="h-6 w-6" />
                      </div>
                      <div>
                        <span className={badgeStyles({ tone: 'brand', uppercase: true })}>
                          {AppConfig.name}
                        </span>
                        <p className="mt-2 text-sm leading-6 text-ink-600">{t('description')}</p>
                      </div>
                    </div>
                  </div>

                  {props.rightNav && (
                    <nav aria-label="Secondary navigation">
                      <ul className="flex flex-wrap items-center gap-2 [&_a]:rounded-full [&_a]:border [&_a]:border-white/90 [&_a]:bg-white/85 [&_a]:px-4 [&_a]:py-2.5 [&_a]:text-sm [&_a]:font-semibold [&_a]:text-ink-700 [&_a]:shadow-xs [&_a]:transition [&_a]:hover:border-brand-100 [&_a]:hover:bg-brand-50 [&_a]:hover:text-brand-700 [&_select]:rounded-full [&_select]:border [&_select]:border-white/90 [&_select]:bg-white/85 [&_select]:px-4 [&_select]:py-2.5 [&_select]:text-sm [&_select]:font-semibold [&_select]:text-ink-700 [&_select]:shadow-xs">
                        {props.rightNav}
                      </ul>
                    </nav>
                  )}
                </div>

                <nav aria-label="Main navigation" className="mt-6">
                  <ul className="flex flex-wrap items-center gap-2 [&_a]:inline-flex [&_a]:items-center [&_a]:gap-2 [&_a]:rounded-full [&_a]:border [&_a]:border-transparent [&_a]:px-4 [&_a]:py-2.5 [&_a]:text-sm [&_a]:font-semibold [&_a]:text-ink-600 [&_a]:transition [&_a]:hover:border-white/90 [&_a]:hover:bg-white [&_a]:hover:text-ink-900 [&_a]:hover:shadow-xs">
                    {props.leftNav}
                  </ul>
                </nav>
              </header>

              <main className="px-5 py-6 sm:px-7 sm:py-8">{props.children}</main>

              <footer className="mt-auto border-t border-white/90 px-5 py-5 text-sm text-ink-500 sm:px-7">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p>
                    {t.rich('footer_text', {
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
                  </p>
                  <div className="inline-flex items-center gap-2 text-sm font-medium text-ink-500">
                    <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </footer>
            </Surface>
          )}
    </div>
  );
};
