'use client';

import { RouterProvider } from 'react-aria-components';

/**
 * Provide a static router for Storybook and tests.
 * @param props - Route provider children.
 * @param props.children
 * @returns Router provider wrapper.
 */
export function StaticRouteProvider(props: {
  children: React.ReactNode;
}) {
  return (
    <RouterProvider
      navigate={() => {}}
      useHref={href => String(href)}
    >
      {props.children}
    </RouterProvider>
  );
}
