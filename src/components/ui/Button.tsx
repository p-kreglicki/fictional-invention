import type { ButtonSize, ButtonVariant } from '@/components/ui/buttonClassName';
import type { ButtonProps as UntitledButtonProps } from '@/components/untitled/base/buttons/button';
import { Button as UntitledButton } from '@/components/untitled/base/buttons/button';
import { cn } from '@/utils/cn';

/**
 * Render a shared button primitive backed by React Aria.
 * @param props - Button props plus local style options.
 * @returns A styled button component.
 */
export function Button(props: Omit<UntitledButtonProps, 'className' | 'color' | 'size'> & {
  className?: string;
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}) {
  const { className, disabled, fullWidth, isDisabled, size, variant, ...buttonProps } = props;
  const color = variant === 'destructive' ? 'primary-destructive' : variant ?? 'secondary';

  return (
    <UntitledButton
      {...buttonProps}
      className={cn(fullWidth && 'w-full', className)}
      color={color}
      isDisabled={isDisabled ?? disabled}
      size={size ?? 'md'}
    />
  );
}
