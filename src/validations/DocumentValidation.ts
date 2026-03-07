import * as z from 'zod';

export const DocumentStatusSchema = z.enum([
  'uploading',
  'processing',
  'ready',
  'failed',
]);

export const DocumentContentTypeSchema = z.enum([
  'pdf',
  'url',
  'text',
]);

export const UrlUploadSchema = z.object({
  type: z.literal('url'),
  url: z
    .string()
    .url()
    .refine(url => url.startsWith('https://'), {
      message: 'Only HTTPS URLs are allowed',
    }),
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

export const DocumentListItemSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(200),
  contentType: DocumentContentTypeSchema,
  status: DocumentStatusSchema,
  searchable: z.boolean(),
  chunkCount: z.number().int().nonnegative().nullable(),
  errorMessage: z.string().trim().min(1).nullable(),
  sourceUrl: z.url().nullable(),
  originalFilename: z.string().trim().min(1).nullable(),
  createdAt: z.iso.datetime(),
  processedAt: z.iso.datetime().nullable(),
});

export const DashboardSummarySchema = z.object({
  documentCounts: z.object({
    total: z.number().int().nonnegative(),
    uploading: z.number().int().nonnegative(),
    processing: z.number().int().nonnegative(),
    ready: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  activeGenerationJobsCount: z.number().int().nonnegative(),
  recentAverageScore: z.number().int().min(0).max(100).nullable(),
});

export type UrlUpload = z.infer<typeof UrlUploadSchema>;
export type TextUpload = z.infer<typeof TextUploadSchema>;
export type DocumentUpload = z.infer<typeof DocumentUploadSchema>;
export type DocumentListItem = z.infer<typeof DocumentListItemSchema>;
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
