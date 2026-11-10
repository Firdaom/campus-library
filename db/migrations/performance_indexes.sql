-- ============================================================================
-- Campus Library — Performance indexes (no schema/logic change)
-- Pure indexes: they only speed up existing queries. Safe to re-run.
-- ============================================================================

create extension if not exists pg_trgm;

-- Browse / GET /api/resources search: `ilike '%q%'` on author, category and
-- description (title already has idx_resources_title_trgm in schema.sql).
create index if not exists idx_resources_author_trgm
  on public.resources using gin (author gin_trgm_ops);
create index if not exists idx_resources_category_trgm
  on public.resources using gin (category gin_trgm_ops);
create index if not exists idx_resources_description_trgm
  on public.resources using gin (description gin_trgm_ops);

-- Circulation Desk student search: `ilike '%q%'` on name and email.
create index if not exists idx_users_name_trgm
  on public.users using gin (name gin_trgm_ops);
create index if not exists idx_users_email_trgm
  on public.users using gin (email gin_trgm_ops);

-- Dashboard / notification bell / cron: "this user's unreturned loans" and
-- "all unreturned loans due by X" (uses returned_at, not the status column).
create index if not exists idx_loans_user_active
  on public.loans (user_id) where returned_at is null;
create index if not exists idx_loans_due_at_active
  on public.loans (due_at) where returned_at is null;
-- My Loans page: ORDER BY borrowed_at DESC for one user.
create index if not exists idx_loans_user_borrowed_at
  on public.loans (user_id, borrowed_at desc);

-- Notification cron: today's history rows (one lookup by sent_on).
create index if not exists idx_notification_history_sent_on
  on public.notification_history (sent_on) where sent_on is not null;

-- Reservation pages / bell: a user's reservations by status and age.
create index if not exists idx_reservations_user_status_created
  on public.reservations (user_id, status, created_at);
-- Expiry cron: ready reservations past expires_at.
create index if not exists idx_reservations_ready_expires
  on public.reservations (expires_at) where status = 'ready';
