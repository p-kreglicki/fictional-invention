import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import { extractPdfText, hasExtractableText, processPdf } from './PdfExtractor';

// Minimal valid PDF with text content for testing
// This PDF contains the text "Hello World" in a basic structure
function createPdfWithText(): Buffer {
  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 12 Tf 100 700 Td (Hello World) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000231 00000 n
0000000325 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
407
%%EOF`;
  return Buffer.from(pdfContent);
}

// Minimal PDF without text content (empty page)
function createPdfWithoutText(): Buffer {
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

describe('extractPdfText', () => {
  it('extracts text from valid PDF', async () => {
    const buffer = createPdfWithText();
    const result = await extractPdfText(buffer);

    expect(result.success).toBe(true);
    expect(result.text).toContain('Hello World');
    expect(result.pageCount).toBe(1);
    expect(result.error).toBeUndefined();
    expect(result.errorCode).toBeUndefined();
  });

  it('reports NO_TEXT for PDF without extractable text', async () => {
    const buffer = createPdfWithoutText();
    const result = await extractPdfText(buffer);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('NO_TEXT');
    expect(result.error).toContain('No text could be extracted');
  });

  it('reports EXTRACTION_FAILED for invalid buffer', async () => {
    const buffer = Buffer.from('not a pdf at all');
    const result = await extractPdfText(buffer);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('EXTRACTION_FAILED');
    expect(result.error).toBe('Failed to extract text from PDF.');
  });

  it('accepts Uint8Array input', async () => {
    const buffer = createPdfWithText();
    const uint8Array = new Uint8Array(buffer);
    const result = await extractPdfText(uint8Array);

    expect(result.success).toBe(true);
    expect(result.text).toContain('Hello World');
  });

  it('includes page count in result', async () => {
    const buffer = createPdfWithText();
    const result = await extractPdfText(buffer);

    expect(result.pageCount).toBeGreaterThan(0);
  });
});

// Note: PAGE_LIMIT_EXCEEDED and TIMEOUT error codes require either:
// - A real 100+ page PDF for page limit testing
// - Long-running/malformed PDF for timeout testing
// These are validated through manual integration testing with crafted files.

describe('hasExtractableText', () => {
  it('returns true for PDF with text', async () => {
    const buffer = createPdfWithText();
    const result = await hasExtractableText(buffer);

    expect(result).toBe(true);
  });

  it('returns false for PDF without text', async () => {
    const buffer = createPdfWithoutText();
    const result = await hasExtractableText(buffer);

    expect(result).toBe(false);
  });

  it('returns false for invalid buffer', async () => {
    const buffer = Buffer.from('invalid');
    const result = await hasExtractableText(buffer);

    expect(result).toBe(false);
  });
});

describe('processPdf', () => {
  it('extracts text from valid PDF', async () => {
    const buffer = createPdfWithText();
    const result = await processPdf(buffer);

    expect(result.success).toBe(true);
    expect(result.text).toContain('Hello World');
  });

  it('returns VALIDATION_FAILED for invalid PDF header', async () => {
    const buffer = Buffer.from('not a pdf');
    const result = await processPdf(buffer);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('VALIDATION_FAILED');
  });

  it('returns VALIDATION_FAILED for PDF with data after EOF', async () => {
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
<script>malicious</script>`;
    const buffer = Buffer.from(polyglotPdf);
    const result = await processPdf(buffer);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('VALIDATION_FAILED');
  });
});
