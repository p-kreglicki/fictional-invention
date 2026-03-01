import * as z from 'zod';

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

export type UrlUpload = z.infer<typeof UrlUploadSchema>;
export type TextUpload = z.infer<typeof TextUploadSchema>;
export type DocumentUpload = z.infer<typeof DocumentUploadSchema>;
