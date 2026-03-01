import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import {
  exceedsPdfSizeLimit,
  getMaxPdfSize,
  validatePdfBuffer,
} from './PdfValidator';

// Minimal valid PDF structure for testing
// Contains %PDF header and %%EOF trailer
function createValidPdfBuffer(): Buffer {
  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer
<< /Size 4 /Root 1 0 R >>
startxref
196
%%EOF`;
  return Buffer.from(pdfContent);
}

describe('validatePdfBuffer', () => {
  it('accepts valid PDF with correct structure', async () => {
    const buffer = createValidPdfBuffer();
    const result = await validatePdfBuffer(buffer);

    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects file without PDF header', async () => {
    const buffer = Buffer.from('This is not a PDF file');
    const result = await validatePdfBuffer(buffer);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid PDF header');
  });

  it('rejects file with wrong magic bytes', async () => {
    const buffer = Buffer.from([0x50, 0x4B, 0x03, 0x04]); // ZIP magic bytes
    const result = await validatePdfBuffer(buffer);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid PDF header');
  });

  it('rejects file exceeding size limit', async () => {
    // Create a buffer slightly over 10MB
    const oversizedContent = `%PDF-1.4\n${'x'.repeat(10 * 1024 * 1024)}`;
    const buffer = Buffer.from(oversizedContent);
    const result = await validatePdfBuffer(buffer);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('PDF exceeds size limit');
  });

  it('rejects file too small to be valid PDF', async () => {
    const buffer = Buffer.from('%PD'); // Only 3 bytes
    const result = await validatePdfBuffer(buffer);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('File too small to be a valid PDF');
  });

  it('rejects file without EOF marker', async () => {
    // PDF header but no %%EOF
    const pdfWithoutEof = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj';
    const buffer = Buffer.from(pdfWithoutEof);
    const result = await validatePdfBuffer(buffer);

    expect(result.valid).toBe(false);
    // Will fail either at file-type detection or EOF check
    expect(result.error).toMatch(/File type detection failed|Invalid PDF structure/);
  });

  it('rejects PDF with data after EOF marker (polyglot prevention)', async () => {
    // Valid PDF structure but with malicious data appended after %%EOF
    const polyglotPdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer
<< /Size 4 /Root 1 0 R >>
startxref
196
%%EOF
<script>alert('xss')</script>`;
    const buffer = Buffer.from(polyglotPdf);
    const result = await validatePdfBuffer(buffer);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid data after PDF end marker');
  });

  it('accepts PDF with only whitespace after EOF marker', async () => {
    const buffer = createValidPdfBuffer();
    // Add some trailing whitespace
    const withWhitespace = Buffer.concat([buffer, Buffer.from('\n  \r\n')]);
    const result = await validatePdfBuffer(withWhitespace);

    expect(result.valid).toBe(true);
  });

  it('rejects PDF with double EOF marker (polyglot bypass attempt)', async () => {
    // Attack vector: %%EOF\n<script>...</script>\n%%EOF
    // This tries to bypass polyglot detection by adding a second %%EOF at the end
    const doubleEofPdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer
<< /Size 4 /Root 1 0 R >>
startxref
196
%%EOF
<script>alert('xss')</script>
%%EOF`;
    const buffer = Buffer.from(doubleEofPdf);
    const result = await validatePdfBuffer(buffer);

    expect(result.valid).toBe(false);
    expect(result.error).toBe('Invalid data after PDF end marker');
  });

  it('accepts Uint8Array input', async () => {
    const buffer = createValidPdfBuffer();
    const uint8Array = new Uint8Array(buffer);
    const result = await validatePdfBuffer(uint8Array);

    expect(result.valid).toBe(true);
  });
});

describe('exceedsPdfSizeLimit', () => {
  it('returns false for file under limit', () => {
    expect(exceedsPdfSizeLimit(1024)).toBe(false);
    expect(exceedsPdfSizeLimit(5 * 1024 * 1024)).toBe(false);
  });

  it('returns false for file at limit', () => {
    expect(exceedsPdfSizeLimit(10 * 1024 * 1024)).toBe(false);
  });

  it('returns true for file over limit', () => {
    expect(exceedsPdfSizeLimit(10 * 1024 * 1024 + 1)).toBe(true);
  });
});

describe('getMaxPdfSize', () => {
  it('returns 10MB in bytes', () => {
    expect(getMaxPdfSize()).toBe(10 * 1024 * 1024);
  });
});
