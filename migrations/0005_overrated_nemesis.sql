ALTER TABLE "exercises" DROP CONSTRAINT "exercises_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "generation_jobs" DROP CONSTRAINT "generation_jobs_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "responses" DROP CONSTRAINT "responses_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "responses" DROP CONSTRAINT "responses_exercise_id_exercises_id_fk";
--> statement-breakpoint
DROP INDEX "responses_user_submission_unique_idx";--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "responses_user_submission_unique_idx" ON "responses" USING btree ("user_id","client_submission_id") WHERE "responses"."client_submission_id" is not null;