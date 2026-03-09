import { cn } from '@/utils/cn';

export type SurfaceTone = 'default' | 'muted' | 'strong';

/**
 * Build Untitled-style surface classes.
 * @param input - Surface tone and layout options.
 * @param input.tone - Visual emphasis for the surface.
 * @param input.padded - Whether the surface should apply default padding.
 * @param input.className - Additional Tailwind classes.
 * @returns Tailwind class names for a panel surface.
 */
export function surfaceClassName(input?: {
  tone?: SurfaceTone;
  padded?: boolean;
  className?: string;
}) {
  const tone = input?.tone ?? 'default';

  return cn(
    'rounded-2xl border shadow-xs',
    input?.padded !== false && 'p-5 sm:p-6',
    tone === 'default' && 'border-ink-200 bg-white',
    tone === 'muted' && 'border-ink-200 bg-ink-25',
    tone === 'strong' && 'border-brand-100 bg-brand-25',
    input?.className,
  );
}
