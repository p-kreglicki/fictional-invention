/**
 * Text sanitization utilities for content ingestion.
 * Handles Unicode normalization, control character removal, and whitespace cleanup.
 */

// Control characters to remove (C0, C1, and other problematic chars)
// Excludes tab (\t), newline (\n), and carriage return (\r)
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_REGEX = /[\x00-\x08\v\f\x0E-\x1F\x7F-\x9F]/g;

// Zero-width characters that should be removed
const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF\u00AD]/g;

// Bidirectional text override characters (security risk for text spoofing)
const BIDI_CONTROL_REGEX = /[\u202A-\u202E\u2066-\u2069]/g;

// Line ending normalization
const CRLF_REGEX = /\r\n/g;
const CR_REGEX = /\r/g;

// Normalize multiple spaces to single space
const MULTI_SPACE_REGEX = / +/g;

// Normalize multiple newlines to double newline (paragraph break)
const MULTI_NEWLINE_REGEX = /\n{3,}/g;

/**
 * Sanitizes text for safe storage and processing.
 * @param text - Raw input text
 * @returns Sanitized text with normalized unicode, removed control chars, and clean whitespace
 */
export function sanitizeText(text: string): string {
  return text
    // Unicode NFC normalization (canonical decomposition + canonical composition)
    .normalize('NFC')
    // Remove null bytes and control characters
    .replace(CONTROL_CHAR_REGEX, '')
    // Remove zero-width characters
    .replace(ZERO_WIDTH_REGEX, '')
    // Remove bidirectional text override characters (security risk)
    .replace(BIDI_CONTROL_REGEX, '')
    // Normalize CRLF to LF
    .replace(CRLF_REGEX, '\n')
    // Remove standalone carriage returns
    .replace(CR_REGEX, '\n')
    // Normalize multiple spaces to single space
    .replace(MULTI_SPACE_REGEX, ' ')
    // Normalize excessive newlines to paragraph breaks
    .replace(MULTI_NEWLINE_REGEX, '\n\n')
    // Trim leading/trailing whitespace
    .trim();
}

/**
 * Checks if text contains only whitespace or is empty after sanitization.
 * @param text - Text to check
 * @returns True if text is effectively empty
 */
export function isEmptyText(text: string): boolean {
  return sanitizeText(text).length === 0;
}

/**
 * Sanitizes text and validates minimum content length.
 * @param text - Raw input text
 * @param minLength - Minimum length after sanitization (default: 100)
 * @returns Object with sanitized text and validation result
 */
export function sanitizeAndValidate(text: string, minLength = 100) {
  const sanitized = sanitizeText(text);
  return {
    text: sanitized,
    valid: sanitized.length >= minLength,
    length: sanitized.length,
  };
}
