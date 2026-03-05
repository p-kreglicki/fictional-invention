# PR Draft: Exercise generation flow (API + dashboard UI)

## Summary
- Add async exercise generation jobs with lifecycle persistence.
- Add RAG retrieval from Pinecone and structured generation via Mistral.
- Add authenticated exercise APIs: generate, job status, and list.
- Add dashboard exercises page with generation form, polling, and result cards.
- Add translations for exercise dashboard in English and French.

## Testing
- `npm run check:types`
- `npm run lint`
- `npm test`

## Post-Deploy Monitoring & Validation
- **What to monitor/search**
  - Logs:
    - `generation_job_queued`
    - `generation_job_started`
    - `generation_job_completed`
    - `generation_job_failed`
    - `exercise_generation_attempt_failed`
    - `exercise_generation_retry`
  - Metrics/Dashboards:
    - Job success rate: `completed / (completed + failed)`
    - Mean generation latency: `completedAt - startedAt`
    - Retry rate: `exercise_generation_retry` count per 15 minutes
    - Failure code distribution: `NO_CONTENT`, `WORKER_INTERRUPTED`, `GENERATION_FAILED`
- **Validation checks (queries/commands)**
  - API smoke:
    - `POST /api/exercises/generate` with ready documents returns `202`
    - `GET /api/exercises/jobs/{id}` transitions `pending -> processing -> completed|failed`
    - `GET /api/exercises` returns recent exercises and active jobs
  - Data checks:
    - New `generation_jobs` rows created per request
    - `generated_count + failed_count` equals `requested_count` at terminal state
    - `exercise_ids` references existing exercise rows
- **Expected healthy behavior**
  - Most jobs reach `completed` within expected model latency window.
  - Retry logs are occasional, not continuous for each job.
  - No sustained growth of stale `pending/processing` jobs older than 10 minutes.
- **Failure signal(s) / rollback trigger**
  - Trigger:
    - `generation_job_failed` rate > 20% for 30 minutes, or
    - sustained `WORKER_INTERRUPTED` errors after deploy, or
    - API `POST /api/exercises/generate` non-2xx spike.
  - Immediate action:
    - disable access to `/dashboard/exercises` navigation link and investigate.
    - if needed, revert this feature branch deployment.
- **Validation window & owner**
  - Window: first 48 hours after deployment.
  - Owner: feature implementer + on-call engineer.
