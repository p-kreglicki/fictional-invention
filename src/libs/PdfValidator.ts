/**
 * PDF validation utilities for secure content ingestion.
 * Validates PDF files using magic bytes, file-type detection, and structure checks.
 */

import { Buffer } from 'node:buffer';

import { fileTypeFromBuffer } from 'file-type';

// PDF magic bytes: %PDF
const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46] as const;

// Maximum PDF file size (10MB)
const MAX_PDF_SIZE = 10 * 1024 * 1024;

// Minimum bytes needed for header check
const MIN_HEADER_BYTES = 4;

// Bytes to check for EOF marker (search last 1KB for %%EOF)
const EOF_SEARCH_BYTES = 1024;

export type PdfValidationResult = {
  valid: boolean;
  error?: string;
};

/**
 * Validates a PDF buffer for security and integrity.
 * Performs magic bytes check, file-type validation, and EOF marker verification.
 * @param buffer - Raw PDF file buffer
 * @returns Validation result with error message if invalid
 */
export async function validatePdfBuffer(
  buffer: Buffer | Uint8Array,
): Promise<PdfValidationResult> {
  // Convert to Buffer if Uint8Array
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  // Size limit check
  if (buf.length > MAX_PDF_SIZE) {
    return { valid: false, error: 'PDF exceeds 10MB limit' };
  }

  // Minimum size for header
  if (buf.length < MIN_HEADER_BYTES) {
    return { valid: false, error: 'File too small to be a valid PDF' };
  }

  // Magic bytes check (%PDF)
  const header = buf.subarray(0, MIN_HEADER_BYTES);
  const isPdfHeader = PDF_MAGIC_BYTES.every((byte, i) => header[i] === byte);

  if (!isPdfHeader) {
    return { valid: false, error: 'Invalid PDF header' };
  }

  // Deep file type detection using file-type library
  const fileType = await fileTypeFromBuffer(buf);
  if (!fileType || fileType.mime !== 'application/pdf') {
    return { valid: false, error: 'File type detection failed' };
  }

  // EOF marker check (polyglot attack prevention)
  // Search last 1KB for %%EOF marker and ensure it's the last non-whitespace content
  const tailStart = Math.max(0, buf.length - EOF_SEARCH_BYTES);
  const tail = buf.subarray(tailStart).toString('ascii');
  const eofIndex = tail.lastIndexOf('%%EOF');

  if (eofIndex === -1) {
    return { valid: false, error: 'Invalid PDF structure' };
  }

  // Check that only whitespace follows %%EOF (polyglot prevention)
  const afterEof = tail.slice(eofIndex + 5); // 5 = length of '%%EOF'
  const nonWhitespace = afterEof.replace(/\s/g, '');
  if (nonWhitespace.length > 0) {
    return { valid: false, error: 'Invalid data after PDF end marker' };
  }

  return { valid: true };
}

/**
 * Checks if a file size exceeds the PDF limit.
 * Use for early rejection before reading file content.
 * @param sizeInBytes - File size in bytes
 * @returns True if size exceeds limit
 */
export function exceedsPdfSizeLimit(sizeInBytes: number): boolean {
  return sizeInBytes > MAX_PDF_SIZE;
}

/**
 * Gets the maximum allowed PDF size in bytes.
 * @returns Maximum PDF size (10MB)
 */
export function getMaxPdfSize(): number {
  return MAX_PDF_SIZE;
}
