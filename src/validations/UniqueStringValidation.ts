import * as z from 'zod';

/**
 * Adds a validation issue when duplicate strings appear in the array.
 * @param value - The string array to validate for duplicate entries.
 * @param context - The Zod refinement context used to report validation issues.
 * @param path - The path segment where the duplicate issue should be attached.
 */
export function validateUniqueStrings(
  value: string[],
  context: z.RefinementCtx,
  path: string,
) {
  if (new Set(value).size === value.length) {
    return;
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: `${path} must contain unique values`,
    path: [path],
  });
}
