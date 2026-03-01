/**
 * PDF validation utilities for secure content ingestion.
 * Validates PDF files using magic bytes, file-type detection, and structure checks.
 */

import { Buffer } from 'node:buffer';

import { fileTypeFromBuffer } from 'file-type';

import { PDF_EOF_SEARCH_BYTES, PDF_MAX_SIZE_BYTES } from './PdfConfig';

// PDF magic bytes: %PDF
const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46] as const;

// Minimum bytes needed for header check
const MIN_HEADER_BYTES = 4;

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
  // Size limit check BEFORE buffer copy to avoid unnecessary allocation
  if (buffer.length > PDF_MAX_SIZE_BYTES) {
    return { valid: false, error: 'PDF exceeds size limit' };
  }

  // Convert to Buffer if Uint8Array (after size check)
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

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
  // SECURITY: Use indexOf (first occurrence) not lastIndexOf to prevent double-EOF bypass
  // Attack vector: %%EOF\n<script>...</script>\n%%EOF would pass with lastIndexOf
  const tailStart = Math.max(0, buf.length - PDF_EOF_SEARCH_BYTES);
  const tail = buf.subarray(tailStart).toString('ascii');
  const eofIndex = tail.indexOf('%%EOF');

  if (eofIndex === -1) {
    return { valid: false, error: 'Invalid PDF structure' };
  }

  // Check that only whitespace follows the FIRST %%EOF (polyglot prevention)
  // This catches both trailing data AND duplicate %%EOF markers
  const afterEof = tail.slice(eofIndex + 5); // 5 = length of '%%EOF'
  if (/\S/.test(afterEof)) {
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
  return sizeInBytes > PDF_MAX_SIZE_BYTES;
}

/**
 * Gets the maximum allowed PDF size in bytes.
 * @returns Maximum PDF size
 */
export function getMaxPdfSize(): number {
  return PDF_MAX_SIZE_BYTES;
}
