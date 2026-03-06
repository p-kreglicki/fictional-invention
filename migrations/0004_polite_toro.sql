CREATE TYPE "public"."evaluation_method" AS ENUM('deterministic', 'llm');--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "client_submission_id" uuid;--> statement-breakpoint
ALTER TABLE "responses" ADD COLUMN "evaluation_method" "evaluation_method";--> statement-breakpoint
CREATE UNIQUE INDEX "responses_user_submission_unique_idx" ON "responses" USING btree ("user_id","client_submission_id") WHERE "client_submission_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "responses_exercise_user_created_idx" ON "responses" USING btree ("exercise_id","user_id","created_at");
