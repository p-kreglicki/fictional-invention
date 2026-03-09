'use client';

import { useSyncExternalStore } from 'react';

const screens = {
  'sm': '640px',
  'md': '768px',
  'lg': '1024px',
  'xl': '1280px',
  '2xl': '1536px',
};

/**
 * Checks whether a particular Tailwind CSS viewport size applies.
 * @param size - The size to check, which must either be included in Tailwind CSS's
 * list of default screen sizes, or added to the Tailwind CSS config file.
 * @returns A boolean indicating whether the viewport size applies.
 */
export const useBreakpoint = (size: 'sm' | 'md' | 'lg' | 'xl' | '2xl') => {
  const query = `(min-width: ${screens[size]})`;

  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') {
        return () => {};
      }

      const breakpoint = window.matchMedia(query);
      const handleChange = () => onStoreChange();

      breakpoint.addEventListener('change', handleChange);

      return () => breakpoint.removeEventListener('change', handleChange);
    },
    () => (typeof window === 'undefined' ? true : window.matchMedia(query).matches),
    () => true,
  );
};
