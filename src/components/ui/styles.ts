import type { ButtonSize, ButtonVariant } from '@/components/ui/buttonClassName';
import type { SurfaceTone } from '@/components/ui/surfaceClassName';
import { buttonClassName } from '@/components/ui/buttonClassName';
import { surfaceClassName } from '@/components/ui/surfaceClassName';
import { cn } from '@/utils/cn';

type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

/**
 * Build shared button styles for links and buttons.
 * @param input - Tone, size and width options.
 * @param input.tone - Visual treatment for the button.
 * @param input.size - Height and padding preset.
 * @param input.fullWidth - Whether the button should fill its container.
 * @returns Tailwind class names for a button surface.
 */
export function buttonStyles(input?: {
  tone?: ButtonVariant | 'ghost' | 'danger';
  size?: ButtonSize;
  fullWidth?: boolean;
}) {
  const tone = input?.tone ?? 'secondary';

  return buttonClassName({
    variant: tone === 'ghost' ? 'tertiary' : tone === 'danger' ? 'destructive' : tone,
    size: input?.size,
    fullWidth: input?.fullWidth,
  });
}

/**
 * Build shared badge styles.
 * @param input - Tone and uppercase toggle.
 * @param input.tone - Visual treatment for the badge.
 * @param input.uppercase - Whether the badge label should be uppercase.
 * @returns Tailwind class names for a badge.
 */
export function badgeStyles(input?: {
  tone?: BadgeTone;
  uppercase?: boolean;
}) {
  const tone = input?.tone ?? 'neutral';

  return cn(
    'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold',
    input?.uppercase && 'tracking-[0.2em] uppercase',
    tone === 'neutral' && 'border-ink-200 bg-white/85 text-ink-600',
    tone === 'brand' && 'border-brand-200 bg-brand-50 text-brand-700',
    tone === 'success' && 'border-success-100 bg-success-50 text-success-700',
    tone === 'warning' && 'border-warning-100 bg-warning-50 text-warning-700',
    tone === 'danger' && 'border-error-100 bg-error-50 text-error-700',
  );
}

/**
 * Build shared panel styles.
 * @param input - Panel tone.
 * @param input.tone - Visual emphasis for the panel.
 * @param input.padded - Whether the panel should apply default padding.
 * @param input.className - Additional Tailwind classes.
 * @returns Tailwind class names for a section container.
 */
export function panelStyles(input?: {
  tone?: SurfaceTone;
  padded?: boolean;
  className?: string;
}) {
  return surfaceClassName(input);
}

/**
 * Build shared field styles.
 * @returns Tailwind class names for text inputs.
 */
export function inputStyles() {
  return 'w-full rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 shadow-xs outline-none transition placeholder:text-ink-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-100';
}

/**
 * Build shared field styles.
 * @returns Tailwind class names for textarea inputs.
 */
export function textareaStyles() {
  return 'min-h-40 w-full rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 shadow-xs outline-none transition placeholder:text-ink-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-100';
}

/**
 * Build shared field styles.
 * @returns Tailwind class names for select inputs.
 */
export function selectStyles() {
  return 'w-full appearance-none rounded-2xl border border-ink-200 bg-white px-4 py-3 text-sm text-ink-900 shadow-xs outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100';
}

/**
 * Build shared field label styles.
 * @returns Tailwind class names for form labels.
 */
export function fieldLabelStyles() {
  return 'mb-2 block text-sm font-semibold text-ink-700';
}

/**
 * Build shared heading styles for surface intros.
 * @returns Tailwind class names for section eyebrows.
 */
export function eyebrowStyles() {
  return 'text-xs font-semibold tracking-[0.24em] text-brand-700 uppercase';
}

/**
 * Build shared status badge styles for document and job states.
 * @param status - Status key.
 * @returns Tailwind class names for status state.
 */
export function statusBadgeStyles(status: 'ready' | 'failed' | 'processing' | 'uploading' | 'pending' | 'completed') {
  if (status === 'ready' || status === 'completed') {
    return badgeStyles({ tone: 'success' });
  }

  if (status === 'failed') {
    return badgeStyles({ tone: 'danger' });
  }

  if (status === 'processing' || status === 'pending' || status === 'uploading') {
    return badgeStyles({ tone: 'warning' });
  }

  return badgeStyles({ tone: 'neutral' });
}
