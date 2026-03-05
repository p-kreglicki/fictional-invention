CREATE INDEX "generation_jobs_user_status_created_idx" ON "generation_jobs" ("user_id", "status", "created_at" DESC);--> statement-breakpoint
CREATE INDEX "generation_jobs_pending_created_idx" ON "generation_jobs" ("created_at") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "generation_jobs_processing_started_idx" ON "generation_jobs" ("started_at") WHERE "status" = 'processing';
