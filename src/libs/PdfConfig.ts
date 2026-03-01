/**
 * PDF processing configuration constants.
 * Centralized limits for security, performance, and resource management.
 */

/** Maximum PDF file size in bytes (10MB) */
export const PDF_MAX_SIZE_BYTES = 10 * 1024 * 1024;

/** Maximum number of pages allowed for extraction */
export const PDF_MAX_PAGE_COUNT = 100;

/** Timeout for PDF parsing operations in milliseconds (30 seconds) */
export const PDF_PARSING_TIMEOUT_MS = 30_000;

/** Minimum text length to consider extraction successful */
export const PDF_MIN_TEXT_LENGTH = 10;

/** Number of bytes to search for EOF marker */
export const PDF_EOF_SEARCH_BYTES = 1024;
