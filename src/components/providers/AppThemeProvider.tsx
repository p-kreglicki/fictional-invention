'use client';

import { ThemeProvider } from 'next-themes';

/**
 * Provide theme class management for the application shell.
 * @param props - Theme provider children.
 * @param props.children
 * @returns Theme provider wrapper.
 */
export function AppThemeProvider(props: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      disableTransitionOnChange
      enableSystem={false}
      value={{
        light: 'light-mode',
        dark: 'dark-mode',
      }}
    >
      {props.children}
    </ThemeProvider>
  );
}
