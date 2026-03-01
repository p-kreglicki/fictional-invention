---
title: "feat: Phase 2 Content Ingestion Pipeline"
type: feat
date: 2026-03-01
status: ready
parent: docs/plans/2026-02-28-feat-italian-rag-learning-tool-plan.md
---

# Phase 2: Content Ingestion Pipeline

## Overview

Build a secure content ingestion pipeline that accepts user uploads (PDF files, URLs, plain text), extracts and chunks text content, generates Mistral embeddings, and stores vectors in Pinecone for RAG retrieval.

**Goal:** Accept user content and prepare it for exercise generation via RAG retrieval.

**Estimated effort:** 3-4 days

---

## Technical Approach

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Upload API    │────▶│  Content         │────▶│  Chunking       │
│   /api/upload   │     │  Extractor       │     │  Service        │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
                        ┌──────────────────┐              ▼
                        │   Pinecone       │◀────┌─────────────────┐
                        │   Vector Store   │     │  Embedding      │
                        └──────────────────┘     │  Service        │
                                 ▲               └─────────────────┘
                                 │                        │
                        ┌──────────────────┐              ▼
                        │   PostgreSQL     │◀────┌─────────────────┐
                        │   (documents,    │     │  Storage        │
                        │    chunks)       │     │  Orchestrator   │
                        └──────────────────┘     └─────────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| PDF Library | `unpdf` | Serverless-optimized, modern API, smaller bundle |
| URL Extraction | `@mozilla/readability` + `linkedom` | Industry standard, powers Firefox Reader View |
| Chunking | Recursive character splitting | ~88-89% recall, simpler than semantic chunking |
| Chunk Size | ~500 tokens (~2000 chars) | Optimal for Mistral 1024-dim embeddings |
| Chunk Overlap | 50 tokens (~200 chars) | Context preservation without excessive duplication |
| Token Counting | `mistral-tokenizer-ts` | Accurate for Mistral models (20% variance from tiktoken) |
| Processing | Synchronous with limits | Simple for MVP; async queue for v2 |

### Processing Constraints

| Constraint | Limit | Mitigation |
|------------|-------|------------|
| Mistral rate limit | 2 req/min | Batch 16 texts/request, 31s delays |
| Max chunks/document | 50 | ~25,000 tokens max per document |
| Max processing time | ~2 minutes | Fits within Vercel Pro timeout |
| Document quota | 50/user | Enforced before document creation |

---

## Implementation Phases

### Phase 2.1: Foundation (File Structure & Utilities)

**Goal:** Set up file structure and core utilities.

**Tasks:**

- [x] Install dependencies
  ```bash
  npm install unpdf file-type ipaddr.js @mozilla/readability linkedom mistral-tokenizer-ts
  ```

- [x] Create validation schemas
  - File: `src/validations/DocumentValidation.ts`

- [x] Create text sanitizer utility
  - File: `src/libs/Sanitizer.ts`
  - Unicode NFC normalization
  - Control character removal
  - Whitespace normalization

- [x] Create token counter utility
  - File: `src/libs/TokenCounter.ts`
  - Use `mistral-tokenizer-ts` for accurate counts

**Acceptance Criteria:**
- [x] All dependencies installed
- [x] Validation schemas pass type checking
- [x] Sanitizer handles edge cases (null bytes, zero-width chars)

---

### Phase 2.2: PDF Processing

**Goal:** Secure PDF validation and text extraction.

**Tasks:**

- [ ] Create PDF validator
  - File: `src/libs/PdfValidator.ts`
  - Magic bytes validation (%PDF header)
  - File-type library deep validation
  - EOF marker check (polyglot attack prevention)
  - Size limit enforcement (10MB)

- [ ] Create PDF extractor
  - File: `src/libs/PdfExtractor.ts`
  - Use `unpdf` for serverless-optimized extraction
  - Handle password-protected PDFs (reject with message)
  - Handle image-only PDFs (reject with message)
  - Always call `destroy()` for memory cleanup

**Example Implementation:**

```typescript
// src/libs/PdfValidator.ts
import { fileTypeFromBuffer } from 'file-type';

const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46]; // %PDF
const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB

export async function validatePdfBuffer(buffer: Buffer): Promise<{
  valid: boolean;
  error?: string;
}> {
  if (buffer.length > MAX_PDF_SIZE) {
    return { valid: false, error: 'PDF exceeds 10MB limit' };
  }

  // Magic bytes check
  const header = buffer.subarray(0, 4);
  const isPdfHeader = PDF_MAGIC_BYTES.every((byte, i) => header[i] === byte);

  if (!isPdfHeader) {
    return { valid: false, error: 'Invalid PDF header' };
  }

  // Deep file type detection
  const fileType = await fileTypeFromBuffer(buffer);
  if (!fileType || fileType.mime !== 'application/pdf') {
    return { valid: false, error: 'File type detection failed' };
  }

  // EOF marker check
  const last32 = buffer.subarray(-32).toString('ascii');
  if (!last32.includes('%%EOF')) {
    return { valid: false, error: 'Invalid PDF structure' };
  }

  return { valid: true };
}
```

**Acceptance Criteria:**
- [ ] Valid PDFs pass validation
- [ ] Invalid files rejected with specific error
- [ ] Password-protected PDFs detected and rejected
- [ ] Image-only PDFs handled gracefully

---

### Phase 2.3: URL Processing

**Goal:** Secure URL fetching with SSRF protection.

**Tasks:**

- [ ] Create URL validator with SSRF protection
  - File: `src/libs/UrlValidator.ts`
  - DNS resolution before fetch
  - Block private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, ::1)
  - Block cloud metadata endpoints (169.254.169.254)
  - HTTPS only
  - No redirect following (security)

- [ ] Create URL content extractor
  - File: `src/libs/UrlExtractor.ts`
  - Use `@mozilla/readability` with `linkedom`
  - 10-second timeout
  - 5MB content limit
  - Stream response to check size incrementally

**SSRF Protection (Critical):**

```typescript
// src/libs/UrlValidator.ts
import { URL } from 'node:url';
import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

const BLOCKED_RANGES = [
  'loopback', 'private', 'linkLocal',
  'uniqueLocal', 'multicast', 'reserved',
];

function isPrivateIp(ip: string): boolean {
  try {
    const addr = ipaddr.parse(ip);
    return BLOCKED_RANGES.includes(addr.range());
  } catch {
    return true; // Block on parse failure
  }
}

export async function validateUrl(urlString: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  const url = new URL(urlString);

  // HTTPS only
  if (url.protocol !== 'https:') {
    return { valid: false, error: 'Only HTTPS URLs allowed' };
  }

  // DNS resolution
  const addresses = await dns.resolve4(url.hostname);
  for (const ip of addresses) {
    if (isPrivateIp(ip)) {
      return { valid: false, error: 'URL resolves to private IP' };
    }
  }

  return { valid: true };
}
```

**Acceptance Criteria:**
- [ ] Valid HTTPS URLs pass validation
- [ ] Private IPs blocked (localhost, 10.x, etc.)
- [ ] Cloud metadata endpoints blocked
- [ ] Content extracted from readable pages
- [ ] Non-HTML content rejected

---

### Phase 2.4: Text Chunking

**Goal:** Italian-aware text chunking with overlap.

**Tasks:**

- [ ] Create text chunker
  - File: `src/libs/TextChunker.ts`
  - Recursive character splitting
  - Target: ~500 tokens (~2000 chars)
  - Overlap: ~50 tokens (~200 chars)
  - Sentence-aware boundaries
  - Handle Italian abbreviations (dott., sig., ecc.)

- [ ] Create chunk position tracking
  - Track start/end character positions
  - Track chunk sequence number

**Chunking Algorithm:**

```typescript
// src/libs/TextChunker.ts
const DEFAULT_SEPARATORS = [
  '\n\n',  // Paragraph breaks
  '\n',    // Line breaks
  '. ',    // Sentence endings (with space to handle abbreviations)
  '! ',
  '? ',
  '; ',
  ', ',
  ' ',
];

const DEFAULT_CHUNK_SIZE = 2000;  // ~500 tokens
const DEFAULT_OVERLAP = 200;      // ~50 tokens

export type Chunk = {
  text: string;
  position: number;
  startChar: number;
  endChar: number;
};

export function chunkText(text: string, options?: {
  maxChunkSize?: number;
  chunkOverlap?: number;
}): Chunk[] {
  // Normalize and clean text
  const normalized = text.normalize('NFC')
    .replace(/\r\n/g, '\n')
    .replace(/ +/g, ' ')
    .trim();

  // Recursive splitting with separators
  // ... implementation
}
```

**Acceptance Criteria:**
- [ ] Chunks respect token limits
- [ ] Overlap preserves context
- [ ] Italian sentence boundaries respected
- [ ] Chunk positions tracked accurately

---

### Phase 2.5: Storage Orchestration

**Goal:** Coordinate embedding generation and dual-store persistence.

**Tasks:**

- [ ] Create content ingestion orchestrator
  - File: `src/libs/ContentIngestion.ts`
  - Coordinate extraction → chunking → embedding → storage
  - Update document status through lifecycle
  - Handle partial failures gracefully

- [ ] Implement database transactions
  - Create document + chunks in single transaction
  - Store Pinecone IDs in chunks table

- [ ] Implement Pinecone batch upsert
  - Batch 100 vectors per upsert (Pinecone recommendation)
  - Generate deterministic IDs: `{documentId}_chunk_{position}`

**Status Lifecycle:**

```
uploading ──▶ processing ──▶ ready
                   │
                   └──▶ failed (with errorMessage)
```

**Acceptance Criteria:**
- [ ] Document status updates correctly
- [ ] Chunks stored in both PostgreSQL and Pinecone
- [ ] Pinecone IDs match chunk records
- [ ] Failures set document to "failed" with message

---

### Phase 2.6: Upload API Endpoint

**Goal:** Create the upload API with all validations.

**Tasks:**

- [ ] Create upload route handler
  - File: `src/app/[locale]/api/documents/upload/route.ts`
  - Accept FormData (PDF) or JSON (URL/text)
  - Validate user authentication
  - Check document quota (50 max)
  - Dispatch to appropriate extractor
  - Return document ID and initial status

- [ ] Create document status endpoint
  - File: `src/app/[locale]/api/documents/[id]/route.ts`
  - GET: Return document with status
  - DELETE: Remove document and cleanup vectors

**Upload API Schema:**

```typescript
// src/validations/DocumentValidation.ts
import * as z from 'zod';

export const UrlUploadSchema = z.object({
  type: z.literal('url'),
  url: z.string().url(),
  title: z.string().min(1).max(200).optional(),
});

export const TextUploadSchema = z.object({
  type: z.literal('text'),
  content: z.string().min(100).max(100000),
  title: z.string().min(1).max(200),
});

export const DocumentUploadSchema = z.discriminatedUnion('type', [
  UrlUploadSchema,
  TextUploadSchema,
]);

// PDF handled via FormData separately
```

**Acceptance Criteria:**
- [ ] PDF upload via FormData works
- [ ] URL import via JSON works
- [ ] Text paste via JSON works
- [ ] Quota enforcement works
- [ ] Status endpoint returns current state

---

### Phase 2.7: Document Management

**Goal:** Document listing and deletion with cleanup.

**Tasks:**

- [ ] Create document list endpoint
  - File: `src/app/[locale]/api/documents/route.ts`
  - GET: List user's documents with status
  - Include chunk count, created date

- [ ] Implement document deletion
  - DELETE: Remove document, chunks, and Pinecone vectors
  - Use database cascade for chunks
  - Delete Pinecone vectors by prefix filter

**Pinecone Cleanup:**

```typescript
// Delete all vectors for a document
const index = getNamespacedIndex();
await index.deleteMany({
  filter: { document_id: documentId },
});
```

**Acceptance Criteria:**
- [ ] Documents listed correctly
- [ ] Deletion removes all related data
- [ ] Pinecone vectors cleaned up
- [ ] Quota freed after deletion

---

## Error Catalog

| Error Code | User Message | Internal Log |
|------------|--------------|--------------|
| `QUOTA_EXCEEDED` | "You've reached the 50 document limit. Delete some documents to upload more." | Quota check failed |
| `PDF_TOO_LARGE` | "PDF exceeds 10MB limit." | File size: {size} |
| `PDF_INVALID` | "This file doesn't appear to be a valid PDF." | Validation failed: {reason} |
| `PDF_PASSWORD` | "Password-protected PDFs are not supported." | Password exception |
| `PDF_NO_TEXT` | "No text could be extracted from this PDF. It may be image-only." | Empty extraction |
| `URL_INVALID` | "Please enter a valid HTTPS URL." | URL parse failed |
| `URL_BLOCKED` | "This URL cannot be accessed." | SSRF block: {reason} |
| `URL_TIMEOUT` | "The URL took too long to respond." | Fetch timeout |
| `URL_TOO_LARGE` | "The page content exceeds 5MB." | Content size: {size} |
| `URL_NO_CONTENT` | "No readable content found at this URL." | Readability returned null |
| `TEXT_TOO_SHORT` | "Please provide at least 100 characters of text." | Length: {length} |
| `TEXT_TOO_LONG` | "Text exceeds 100,000 character limit." | Length: {length} |
| `PROCESSING_FAILED` | "Processing failed. Please try again." | {detailed error} |
| `EMBEDDING_FAILED` | "Unable to process content. Please try again later." | Mistral error: {error} |

---

## Dependencies to Install

```bash
npm install unpdf file-type ipaddr.js @mozilla/readability linkedom mistral-tokenizer-ts
```

| Package | Purpose |
|---------|---------|
| `unpdf` | Serverless PDF text extraction |
| `file-type` | Deep file type detection |
| `ipaddr.js` | IP address parsing for SSRF protection |
| `@mozilla/readability` | Web content extraction |
| `linkedom` | Server-side DOM for Readability |
| `mistral-tokenizer-ts` | Accurate token counting |

---

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/validations/DocumentValidation.ts` | Create | Zod schemas for upload |
| `src/libs/Sanitizer.ts` | Create | Text sanitization |
| `src/libs/TokenCounter.ts` | Create | Mistral token counting |
| `src/libs/PdfValidator.ts` | Create | PDF security validation |
| `src/libs/PdfExtractor.ts` | Create | PDF text extraction |
| `src/libs/UrlValidator.ts` | Create | SSRF protection |
| `src/libs/UrlExtractor.ts` | Create | Web content extraction |
| `src/libs/TextChunker.ts` | Create | Text chunking |
| `src/libs/ContentIngestion.ts` | Create | Processing orchestrator |
| `src/app/[locale]/api/documents/upload/route.ts` | Create | Upload endpoint |
| `src/app/[locale]/api/documents/route.ts` | Create | List endpoint |
| `src/app/[locale]/api/documents/[id]/route.ts` | Create | Status/delete endpoint |

---

## Security Checklist

### Input Validation
- [ ] PDF magic bytes validated
- [ ] PDF file-type library check
- [ ] PDF EOF marker check
- [ ] URL HTTPS-only enforcement
- [ ] URL DNS resolution before fetch
- [ ] URL private IP blocking (all ranges)
- [ ] URL cloud metadata blocking (169.254.x)
- [ ] Text Unicode normalization (NFC)
- [ ] Text control character removal
- [ ] File size limits enforced

### Content Isolation
- [ ] All queries filter by `user_id`
- [ ] Document ownership verified on access
- [ ] Pinecone metadata includes `user_id`
- [ ] Deletion cascades to all related data

### Rate Limiting
- [ ] Document quota (50/user) enforced
- [ ] Mistral rate limiting (31s delays)
- [ ] Consider Arcjet for upload rate limiting

---

## Acceptance Criteria

### Functional Requirements
- [ ] Can upload PDF files (up to 10MB)
- [ ] Can import URLs (HTTPS only)
- [ ] Can paste plain text (100 chars - 100KB)
- [ ] Documents appear in user's library
- [ ] Status updates through processing lifecycle
- [ ] Can view document details and chunk count
- [ ] Can delete documents (frees quota)

### Non-Functional Requirements
- [ ] Processing completes within 2 minutes
- [ ] Max 50 chunks per document
- [ ] SSRF protection blocks all private IPs
- [ ] PDF validation prevents malicious files
- [ ] Error messages are user-friendly

### Quality Gates
- [ ] All extractors have unit tests
- [ ] SSRF protection has comprehensive tests
- [ ] Integration test for full upload flow
- [ ] Security review of PDF/URL handling

---

## Testing Strategy

### Unit Tests

```typescript
// src/libs/PdfValidator.test.ts
describe('PdfValidator', () => {
  it('accepts valid PDF with correct header', async () => {});
  it('rejects file without PDF header', async () => {});
  it('rejects file exceeding size limit', async () => {});
  it('rejects file without EOF marker', async () => {});
});

// src/libs/UrlValidator.test.ts
describe('UrlValidator', () => {
  it('accepts valid HTTPS URL', async () => {});
  it('rejects HTTP URL', async () => {});
  it('rejects localhost', async () => {});
  it('rejects private IP 10.x.x.x', async () => {});
  it('rejects private IP 192.168.x.x', async () => {});
  it('rejects cloud metadata endpoint', async () => {});
});

// src/libs/TextChunker.test.ts
describe('TextChunker', () => {
  it('chunks text within size limit', () => {});
  it('preserves overlap between chunks', () => {});
  it('handles Italian abbreviations correctly', () => {});
  it('tracks chunk positions accurately', () => {});
});
```

### Integration Tests

```typescript
// tests/integration/DocumentUpload.spec.ts
describe('Document Upload', () => {
  it('processes PDF and creates chunks', async () => {});
  it('imports URL and extracts content', async () => {});
  it('stores chunks in database and Pinecone', async () => {});
  it('updates document status through lifecycle', async () => {});
  it('enforces quota limit', async () => {});
});
```

---

## Open Questions (Answered)

| Question | Decision |
|----------|----------|
| Background processing? | Synchronous for MVP (with chunk limits). Async queue for v2. |
| Max chunks per document? | 50 chunks (~25K tokens). Larger docs rejected. |
| Duplicate handling? | Allow duplicates. User manages library. |
| Original file storage? | No retention. Only extracted text stored. |
| Language detection? | Not for MVP. Assume Italian content. |
| Processing progress? | Poll `/api/documents/:id` every 5 seconds. |

---

## Future Enhancements (Out of Scope)

- Background job queue for large documents
- Progress streaming via SSE/WebSocket
- Duplicate detection via content hash
- Language detection and validation
- OCR for image-only PDFs
- Original file retention for re-download

---

## References

### Internal
- Phase 1 Plan: `docs/plans/2026-02-28-feat-phase1-foundation-infrastructure-plan.md`
- Parent Plan: `docs/plans/2026-02-28-feat-italian-rag-learning-tool-plan.md`
- Pinecone Client: `src/libs/Pinecone.ts`
- Mistral Client: `src/libs/Mistral.ts`

### External
- [unpdf Documentation](https://github.com/unjs/unpdf)
- [Mozilla Readability](https://github.com/mozilla/readability)
- [OWASP SSRF Prevention](https://owasp.org/www-community/pages/controls/SSRF_Prevention_in_Nodejs)
- [Mistral Embeddings](https://docs.mistral.ai/capabilities/embeddings)
- [RAG Chunking Strategies 2026](https://www.firecrawl.dev/blog/best-chunking-strategies-rag)
