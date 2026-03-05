CREATE TYPE "public"."generation_job_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "generation_job_status" DEFAULT 'pending' NOT NULL,
	"exercise_type" "exercise_type" NOT NULL,
	"document_ids" uuid[] NOT NULL,
	"requested_count" integer NOT NULL,
	"generated_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"exercise_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"difficulty" "difficulty",
	"topic_focus" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
