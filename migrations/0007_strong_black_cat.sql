ALTER TABLE "exercises" ADD COLUMN "source_document_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
UPDATE "exercises" AS "exercise"
SET "source_document_ids" = COALESCE((
  SELECT array_agg(DISTINCT "chunk"."document_id")
  FROM "chunks" AS "chunk"
  WHERE "chunk"."id" = ANY("exercise"."source_chunk_ids")
), '{}'::uuid[]);--> statement-breakpoint
ALTER TABLE "exercises" ALTER COLUMN "source_document_ids" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "exercises_source_document_ids_idx" ON "exercises" USING gin ("source_document_ids");
