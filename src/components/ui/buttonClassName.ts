import { styles as buttonStylesConfig } from '@/components/untitled/base/buttons/button';
import { cx } from '@/utils/cx';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Build Untitled-style button classes.
 * @param input - Variant, size, and width options.
 * @param input.variant - Visual treatment for the button.
 * @param input.size - Height and padding preset.
 * @param input.fullWidth - Whether the button should fill its container.
 * @returns Tailwind class names for a button surface.
 */
export function buttonClassName(input?: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}) {
  const variant = input?.variant ?? 'secondary';
  const size = input?.size ?? 'md';
  const color = variant === 'destructive' ? 'primary-destructive' : variant;

  return cx(
    buttonStylesConfig.common.root,
    buttonStylesConfig.sizes[size].root,
    buttonStylesConfig.colors[color].root,
    input?.fullWidth && 'w-full',
  );
}
