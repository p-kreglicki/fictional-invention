CREATE TYPE "public"."evaluation_method" AS ENUM('deterministic', 'llm');--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "client_submission_id" uuid;--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "evaluation_method" "evaluation_method";--> statement-breakpoint
UPDATE "responses" SET "client_submission_id" = gen_random_uuid() WHERE "client_submission_id" IS NULL;--> statement-breakpoint
UPDATE "responses" SET "evaluation_method" = 'deterministic' WHERE "evaluation_method" IS NULL;--> statement-breakpoint
ALTER TABLE "responses" ALTER COLUMN "client_submission_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "responses" ALTER COLUMN "evaluation_method" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "responses_user_submission_unique_idx" ON "responses" USING btree ("user_id","client_submission_id");--> statement-breakpoint
CREATE INDEX "responses_exercise_user_created_idx" ON "responses" USING btree ("exercise_id","user_id","created_at");
