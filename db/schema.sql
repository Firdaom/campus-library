-- ============================================================================
-- Campus Library Loan & Reservation System — Database Schema
-- Target: Supabase PostgreSQL
-- Covers: tables, data-integrity constraints (BR-01 and reservation rule),
--         and Row-Level Security policies for Student / Staff / Admin.
--
-- NOTES ON DEVIATIONS FROM THE SPEC (flagged earlier, applied here):
--   1. Copy.status gets a third value 'held', used while a copy is reserved
--      for a specific student during the 48h BR-05 window. Without this,
--      the copy would look "available" and a different student could be
--      issued the loan during the hold window.
--   2. Roles are modeled as a Postgres ENUM and mirrored onto
--      auth.users via a trigger, so RLS policies can check role cheaply
--      without a join on every request (via the current_role() helper).
--   3. Reservation queue order is FIFO by created_at (BR-05 / FR-12 needs
--      an explicit rule for "next student in line").
--   4. (2026-10-29) Auth is Google OAuth only (no password), so users gets
--      `email` (needed to call Student Identity and for notifications) and
--      an `eligibility_status` cache, written by app/auth/callback and
--      re-checked at borrow time (POST /api/loans) — see lib/eligibility.ts.
--   5. (2026-10-29) notification_history dedupes loan.due/loan.overdue
--      events so the daily cron never re-sends the same event on the same
--      day (see 11. Notification history below).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Extensions & enums
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

create type user_role as enum ('student', 'staff', 'admin');
create type user_status as enum ('active', 'suspended');
create type eligibility_status as enum ('unverified', 'eligible', 'ineligible');
create type copy_status as enum ('available', 'loaned', 'held');
create type loan_status as enum ('active', 'returned');
create type reservation_status as enum ('pending', 'ready', 'cancelled', 'expired', 'fulfilled');
create type notification_event_type as enum ('loan.due', 'loan.overdue', 'reservation.ready');

-- ----------------------------------------------------------------------------
-- 1. users  (profile row, 1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table public.users (
  id                    uuid primary key references auth.users (id) on delete cascade,
  name                  text not null,
  email                 text not null,          -- mirrored from auth.users; used for Student Identity + notifications
  identity_ref          text,                    -- external Student Identity reference, once confirmed
  role                  user_role not null default 'student',
  status                user_status not null default 'active',
  eligibility_status    eligibility_status not null default 'unverified',
  eligibility_checked_at timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.users is 'Profile + role for every account. Created on first Google sign-in (FR-00); only Admin may change role (FR-11). eligibility_status is a cache written by app/auth/callback and refreshed at borrow time — it is never the sole gate on a loan, see loans_write check in POST /api/loans.';

-- Keep users.updated_at current
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

-- Auto-create a public.users row on first Google sign-in (both new and
-- returning students hit the same "Continue with Google" button — Supabase
-- Auth only fires this trigger the first time a given auth.users row is
-- created). Role defaults to 'student'; staff/admin accounts are promoted
-- by an Admin via PATCH /admin/users/{id}/role, never granted here.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, name, email, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
    new.email,
    'student',
    'active'
  );
  return new;
end;
$$;

create trigger trg_on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Helper used throughout RLS policies: role of the currently authenticated user.
create or replace function public.current_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_staff_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('staff', 'admin') from public.users where id = auth.uid()), false);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.users where id = auth.uid()), false);
$$;

-- ----------------------------------------------------------------------------
-- 2. resources
-- ----------------------------------------------------------------------------
create table public.resources (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  category    text not null,
  author      text,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_resources_category on public.resources (category);
create index idx_resources_title_trgm on public.resources using gin (title gin_trgm_ops);
create extension if not exists pg_trgm;

create trigger trg_resources_updated_at
before update on public.resources
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. copies
-- ----------------------------------------------------------------------------
create table public.copies (
  id          uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id) on delete cascade,
  status      copy_status not null default 'available',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_copies_resource_id on public.copies (resource_id);
create index idx_copies_status on public.copies (status);

create trigger trg_copies_updated_at
before update on public.copies
for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. loans
-- ----------------------------------------------------------------------------
create table public.loans (
  id          uuid primary key default gen_random_uuid(),
  copy_id     uuid not null references public.copies (id),
  user_id     uuid not null references public.users (id),
  borrowed_at timestamptz not null default now(),
  due_at      timestamptz not null,
  returned_at timestamptz,
  status      loan_status not null default 'active',
  created_at  timestamptz not null default now()
);

create index idx_loans_user_id on public.loans (user_id);
create index idx_loans_copy_id on public.loans (copy_id);
create index idx_loans_due_at on public.loans (due_at) where status = 'active';

-- *** BR-01 / AC-03: only one ACTIVE (unreturned) loan per copy, enforced in
-- the database, not just the application. A partial unique index means two
-- concurrent POST /loans for the same copy race at the DB level; the loser
-- gets a unique-violation, which the API maps to 409. ***
create unique index uq_loans_one_active_per_copy
  on public.loans (copy_id)
  where returned_at is null;

-- Keep loan.status consistent with returned_at.
create or replace function public.sync_loan_status()
returns trigger language plpgsql as $$
begin
  if new.returned_at is not null then
    new.status := 'returned';
  else
    new.status := 'active';
  end if;
  return new;
end;
$$;

create trigger trg_loans_sync_status
before insert or update on public.loans
for each row execute function public.sync_loan_status();

-- ----------------------------------------------------------------------------
-- 5. reservations
-- ----------------------------------------------------------------------------
create table public.reservations (
  id          uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources (id),
  user_id     uuid not null references public.users (id),
  status      reservation_status not null default 'pending',
  created_at  timestamptz not null default now(),
  ready_at    timestamptz,          -- when it became 'ready' (starts the 48h clock, BR-05)
  expires_at  timestamptz,          -- ready_at + 48h, set when status -> 'ready'
  held_copy_id uuid references public.copies (id)  -- the specific copy held for this reservation
);

create index idx_reservations_resource_id on public.reservations (resource_id);
create index idx_reservations_user_id on public.reservations (user_id);
create index idx_reservations_status on public.reservations (status);
-- FIFO ordering for "next student in line" (BR-05 / FR-12).
create index idx_reservations_queue_order on public.reservations (resource_id, created_at)
  where status in ('pending', 'ready');

-- *** Data Integrity Rule (section 8) / AC-04b: a user may not have two
-- pending reservations for the same resource. ***
create unique index uq_reservations_one_pending_per_user_resource
  on public.reservations (resource_id, user_id)
  where status = 'pending';

-- ----------------------------------------------------------------------------
-- 5a. notification_history  (2026-10-29: dedupes loan.due / loan.overdue)
-- ----------------------------------------------------------------------------
-- Written only by the service-role cron job (app/api/cron/loan-notifications)
-- for loan.due/loan.overdue, and by lib/services/reservationQueue.ts for
-- reservation.ready (FR-04: "prevent duplicate notifications"). Both callers
-- check this table before calling publishEvent() and insert a row only
-- after a successful Notification Hub delivery — so a retry after a failed
-- delivery naturally re-attempts without a duplicate row existing yet, and
-- a successful delivery is never repeated.
--
-- A row is either loan-shaped (loan_id set, dated by sent_on — loan.due/
-- loan.overdue can legitimately recur once per calendar day) or
-- reservation-shaped (reservation_id set, sent_on left null — a given
-- reservation can only ever go 'ready' once, so dedup doesn't need a date).
create table public.notification_history (
  id             uuid primary key default gen_random_uuid(),
  loan_id        uuid references public.loans (id) on delete cascade,
  reservation_id uuid references public.reservations (id) on delete cascade,
  event_type     notification_event_type not null,
  sent_on        date,              -- Asia/Bangkok calendar date; loan events only
  created_at     timestamptz not null default now(),
  constraint notification_history_exactly_one_subject check (
    (loan_id is not null and reservation_id is null) or
    (loan_id is null and reservation_id is not null)
  )
);

-- One loan.due / loan.overdue event per loan per calendar day — the actual
-- dedupe guard the daily cron relies on (not just an application-level check).
create unique index uq_notification_once_per_loan_per_day
  on public.notification_history (loan_id, event_type, sent_on)
  where loan_id is not null;

-- One reservation.ready event per reservation, ever (FR-04) — the dedupe
-- guard lib/services/reservationQueue.ts relies on.
create unique index uq_notification_once_per_reservation
  on public.notification_history (reservation_id, event_type)
  where reservation_id is not null;

create index idx_notification_history_loan_id on public.notification_history (loan_id);
create index idx_notification_history_reservation_id on public.notification_history (reservation_id);

-- ----------------------------------------------------------------------------
-- 6. Row-Level Security
-- ----------------------------------------------------------------------------
alter table public.users               enable row level security;
alter table public.resources           enable row level security;
alter table public.copies              enable row level security;
alter table public.loans               enable row level security;
alter table public.reservations        enable row level security;
alter table public.notification_history enable row level security;

-- ---- users ------------------------------------------------------------
-- Everyone authenticated can read their own row; Staff/Admin can read all
-- (Staff needs to see who a copy is loaned to at the circulation desk);
-- only Admin can update role/status; a user may update their own non-role
-- fields (e.g. name) — adjust if that should also be Admin-only.
create policy users_select_own_or_staff
  on public.users for select
  using (id = auth.uid() or public.is_staff_or_admin());

create policy users_update_own_profile
  on public.users for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.users where id = auth.uid()));

create policy users_admin_update_any
  on public.users for update
  using (public.is_admin())
  with check (public.is_admin());

-- Row creation happens via the handle_new_auth_user() trigger (security
-- definer), so no INSERT policy is needed for normal clients.

-- ---- resources ----------------------------------------------------------
-- Anyone authenticated can read; only Staff/Admin can write (per data model).
create policy resources_select_authenticated
  on public.resources for select
  to authenticated
  using (true);

create policy resources_write_staff_admin
  on public.resources for all
  to authenticated
  using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

-- ---- copies ---------------------------------------------------------------
create policy copies_select_authenticated
  on public.copies for select
  to authenticated
  using (true);

create policy copies_write_staff_admin
  on public.copies for all
  to authenticated
  using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

-- FR-01: self-service borrow (POST /api/loans) flips a copy from
-- 'available' to 'loaned' using the student's own session client, not the
-- service role — so a student needs narrow, specific write access here too.
-- The loans row is inserted FIRST (see loans_write_self_or_staff below and
-- app/api/loans/route.ts's insertLoan), so by the time this UPDATE runs,
-- the exists() below is always already true for a legitimate self-borrow.
create policy copies_update_self_checkout
  on public.copies for update
  to authenticated
  using (status = 'available')
  with check (
    status = 'loaned'
    and exists (
      select 1 from public.loans l
      where l.copy_id = copies.id and l.user_id = auth.uid() and l.returned_at is null
    )
  );

-- ---- loans ------------------------------------------------------------
-- Student: may SELECT only their own loans (GET /loans/me, FR-07).
-- Staff/Admin: may SELECT and write all loans (FR-03, FR-04).
create policy loans_select_own
  on public.loans for select
  using (user_id = auth.uid() or public.is_staff_or_admin());

-- FR-01: a student may self-insert their OWN loan (self-service borrow);
-- Staff/Admin may insert a loan for anyone (Circulation Desk checkout, and
-- completing a ready reservation's pickup). Renamed from
-- loans_write_staff_admin now that students can insert too.
create policy loans_insert_self_or_staff
  on public.loans for insert
  to authenticated
  with check (user_id = auth.uid() or public.is_staff_or_admin());

create policy loans_update_staff_admin
  on public.loans for update
  to authenticated
  using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

-- ---- reservations ---------------------------------------------------------
-- Student: may SELECT/INSERT/DELETE(cancel) only their own (FR-05, FR-06,
-- AC-05 — ownership enforced here, not just in the API).
-- Staff/Admin: may SELECT/UPDATE all (to process BR-04/BR-05 transitions).
create policy reservations_select_own_or_staff
  on public.reservations for select
  using (user_id = auth.uid() or public.is_staff_or_admin());

create policy reservations_insert_own
  on public.reservations for insert
  to authenticated
  with check (user_id = auth.uid());

-- FR-07: a student may cancel their own 'pending' OR 'ready' reservation
-- (cancelling a 'ready' one also releases its held copy — see
-- DELETE /api/reservations/{id} and lib/services/reservationQueue.ts).
-- Cancellation is modeled as an UPDATE to status = 'cancelled', not a DELETE
-- of the row (the row must survive so FR-04/notification_history dedup and
-- the student's own history stay intact) — so this policy is for UPDATE.
create policy reservations_cancel_own
  on public.reservations for update
  to authenticated
  using (user_id = auth.uid() and status in ('pending', 'ready'))
  with check (user_id = auth.uid() and status = 'cancelled');

create policy reservations_update_staff_admin
  on public.reservations for update
  to authenticated
  using (public.is_staff_or_admin())
  with check (public.is_staff_or_admin());

-- ---- notification_history --------------------------------------------------
-- Staff/Admin may read it (useful for support/debugging); only the
-- service-role client (which bypasses RLS entirely) writes to it, so there
-- is intentionally no insert policy for ordinary authenticated clients.
create policy notification_history_select_staff_admin
  on public.notification_history for select
  to authenticated
  using (public.is_staff_or_admin());

-- ----------------------------------------------------------------------------
-- 7. Seed-friendly view for availability (used by GET /resources, GET /resources/{id})
-- ----------------------------------------------------------------------------
create or replace view public.resource_availability as
select
  r.id,
  r.title,
  r.category,
  r.author,
  r.description,
  count(c.id) filter (where c.status = 'available') as available_copies,
  count(c.id) as total_copies
from public.resources r
left join public.copies c on c.resource_id = r.id
group by r.id;

-- Views inherit RLS from underlying tables when invoked with the caller's
-- role (security_invoker), available on Postgres 15+ / recent Supabase:
alter view public.resource_availability set (security_invoker = on);
