-- ============================================================================
-- Campus Library — Supabase Cron jobs (2026-10-29 decision)
-- Replaces Vercel Cron (free tier only guarantees once-daily runs) with
-- pg_cron + pg_net running inside the Supabase database itself, which stays
-- within the free tier (spec section 10 / NFR-04).
--
-- Run this in the Supabase SQL editor (or via `supabase db push`) AFTER
-- db/schema.sql. Requires the pg_cron and pg_net extensions, which Supabase
-- exposes under the `extensions` schema.
-- ============================================================================

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- ----------------------------------------------------------------------------
-- 1. Secrets, in Supabase Vault — never hardcode the project URL or
--    CRON_SECRET directly in a cron job's SQL body, since pg_cron job
--    definitions are visible to anyone who can query cron.job.
-- ----------------------------------------------------------------------------
-- Run once, replacing the placeholder values (Project Settings -> Vault, or
-- via SQL as below — either way the plaintext never appears in cron.job):
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<same value as CRON_SECRET in .env>', 'cron_secret');
--
-- The job bodies below read them back with vault.decrypted_secrets, so
-- updating a secret's value later (vault key rotation) does not require
-- touching the scheduled job at all.

-- ----------------------------------------------------------------------------
-- 2. Reservation expiry — every 5 minutes (FR-12 / BR-05 / AC-09).
--    Matches the spec's "Proposed workflow": identify expired 'ready'
--    reservations, release held copies / advance the FIFO queue, protected
--    by CRON_SECRET, idempotent against overlapping runs (see
--    app/api/cron/expire-reservations/route.ts's atomic-claim UPDATE).
-- ----------------------------------------------------------------------------
select cron.schedule(
  'expire-reservations',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/api/cron/expire-reservations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- ----------------------------------------------------------------------------
-- 3. Loan due / overdue notifications — once daily at 09:00 Asia/Bangkok
--    (FR-09 / section "Loan Due and Overdue Notifications"). pg_cron's
--    schedule is evaluated in UTC, so 09:00 Asia/Bangkok (UTC+7, no DST) is
--    02:00 UTC. If the project's cron timezone setting is ever changed
--    from UTC, recompute this offset — do not assume '0 9 * * *' is correct
--    without checking `show timezone` / the project's cron config first.
-- ----------------------------------------------------------------------------
select cron.schedule(
  'loan-due-overdue-notifications',
  '0 2 * * *',  -- 02:00 UTC = 09:00 Asia/Bangkok
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/api/cron/loan-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- ----------------------------------------------------------------------------
-- 4. Useful checks while testing idempotency / queue handling
-- ----------------------------------------------------------------------------
-- select * from cron.job;                                  -- confirm both jobs are scheduled
-- select * from cron.job_run_details order by start_time desc limit 20;  -- run history + HTTP status
-- select * from net._http_response order by created desc limit 20;      -- raw pg_net response bodies
