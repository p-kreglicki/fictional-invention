import { twMerge } from 'tailwind-merge';

/**
 * Merge conditional Tailwind class names with Tailwind-aware conflict resolution.
 * @param values - Class name fragments to merge.
 * @returns A merged class name string.
 */
export function cn(...values: Array<string | false | null | undefined>) {
  return twMerge(values.filter(Boolean).join(' '));
}
