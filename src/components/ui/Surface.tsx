import type { SurfaceTone } from '@/components/ui/surfaceClassName';
import { surfaceClassName } from '@/components/ui/surfaceClassName';

/**
 * Render a shared surface primitive.
 * @param props - Surface content and tone options.
 * @param props.children - Surface contents.
 * @param props.className - Additional Tailwind classes.
 * @param props.padded - Whether to apply default padding.
 * @param props.tone - Visual emphasis for the surface.
 * @returns A styled panel container.
 */
export function Surface(props: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
  tone?: SurfaceTone;
}) {
  return (
    <div className={surfaceClassName({ tone: props.tone, padded: props.padded, className: props.className })}>
      {props.children}
    </div>
  );
}
