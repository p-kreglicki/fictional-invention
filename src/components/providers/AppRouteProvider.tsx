'use client';

import { useLocale } from 'next-intl';
import { RouterProvider } from 'react-aria-components';
import { getPathname, useRouter } from '@/libs/I18nNavigation';

/**
 * Provide locale-aware navigation to React Aria based components.
 * @param props - Route provider children.
 * @param props.children
 * @returns Router provider wrapper.
 */
export function AppRouteProvider(props: {
  children: React.ReactNode;
}) {
  const locale = useLocale();
  const router = useRouter();

  return (
    <RouterProvider
      navigate={(href) => {
        router.push(String(href));
      }}
      useHref={href => getPathname({ href: String(href), locale })}
    >
      {props.children}
    </RouterProvider>
  );
}
