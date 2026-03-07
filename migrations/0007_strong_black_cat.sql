ALTER TABLE "exercises" ADD COLUMN "source_document_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ALTER COLUMN "source_document_ids" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "exercises_source_document_ids_idx" ON "exercises" USING gin ("source_document_ids");
