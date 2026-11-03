# Campus Library Loan & Reservation System — Scaffold

Next.js 14 (App Router) + Supabase scaffold matching the product spec, the
2026-10-29 backend decisions, the Student Dashboard pages, and the
Circulation Desk / Admin — Users staff screens. All of it is wired to the
real database — there's no mock data layer anywhere in `app/`.

## What's here

```
db/schema.sql                      Tables, constraints (BR-01, dup-reservation, dup-notification), RLS policies
db/migrations/0001_pg_cron_jobs.sql  Supabase pg_cron + pg_net schedules (reservation expiry, loan notifications)
lib/supabase/{client,server}.ts    Browser / server Supabase clients
lib/currentUser.ts                 requireDashboardUser() — cached per-request auth gate for Server Components
middleware.ts                      Refreshes the auth session on every request
lib/auth.ts                        requireUser / requireRole / withApiErrors helpers (API routes)
lib/auth-client.ts                 signInWithGoogle() / signOut() for Client Components
lib/eligibility.ts                 Shared Student Identity re-verification (sign-in + borrow time), fails closed
lib/dates.ts                       Asia/Bangkok date helpers for the notification cron
lib/services/                      Student Identity, Notification Hub, Analytics, AI recs
types/db.ts                        Shared TS types for all entities
app/auth/callback/route.ts         Google OAuth callback: exchanges code, checks domain, verifies eligibility
app/api/...                        One route per endpoint, including staff resource/copy management
app/(dashboard)/...                Student Dashboard screens (see below)
app/(staff)/...                    Circulation Desk + Admin — Users screens (see below)
components/SignOutButton.tsx       Shared by both route-group layouts
app/globals.css                    Design tokens + layout/component styles shared by every page
vercel.json                        Intentionally empty — crons live in Supabase now, not here
```

## Student Dashboard

All seven pages from the spec are implemented as Server Components reading
Supabase directly (session-bound client, so Row-Level Security scopes every
query to the signed-in user automatically — no separate per-page
authorization logic needed beyond `requireDashboardUser()`):

| Page | Route | Notes |
|---|---|---|
| Dashboard | `/dashboard` | Active-loan / overdue / due-soon / reservation counts, upcoming due dates, ready-for-pickup list |
| Browse Books | `/browse` | Search box (`SearchBox.tsx`, Client Component) + result grid from `resource_availability` |
| Book Details | `/books/[id]` | Copy availability, Reserve button (`ReserveButton.tsx`) when nothing's available, recommendations with the FR-10 fallback |
| My Loans | `/loans` | Borrow/due dates, Active/Overdue/Returned status |
| My Reservations | `/reservations` | FIFO queue position for pending reservations, Cancel button (`CancelReservationButton.tsx`) |
| Notifications | `/notifications` | Derived live from loans/reservations (due soon, overdue, ready for pickup) — see note below |
| Profile | `/profile` | Account info + `eligibility_status` / `eligibility_checked_at`, read-only |

`app/page.tsx` is the Google sign-in screen; it redirects to `/dashboard` if
already signed in. `app/(dashboard)/layout.tsx` is the sidebar shell shared
by all seven pages and is the actual auth gate (redirects to `/` with no
session) — individual pages don't re-check auth, they just call
`requireDashboardUser()` to get the (already-verified) user and a
request-scoped Supabase client.

**Notifications page note**: there's no new "notifications" table. The page
computes due-soon/overdue/ready-for-pickup directly from the student's own
`loans` and `reservations` rows, so it can never drift from My Loans / My
Reservations. The actual email/push side of FR-09 (what reaches students
outside the app) is still the `notification_history`-deduped daily cron
(`app/api/cron/loan-notifications`) and `reservation.ready` events from
`app/api/cron/expire-reservations` / `PATCH /loans/{id}/return` — this page
is a read-only mirror of that state, not a second delivery path.

**Not built**: Login/Register has no separate screen (handled by `app/page.tsx` + Google's own consent screen). The staff resource/copy management APIs (`POST /resources`, `POST /resources/{id}/copies`, etc.) have no UI — the spec's Frontend table doesn't list a screen for them, only Circulation Desk and Admin — Users, which are both built (below).

## Circulation Desk & Admin — Users

Both live under the `app/(staff)` route group, gated by `requireStaffUser()`
(`lib/currentUser.ts`) — redirects anyone who isn't `staff` or `admin` back
to `/dashboard`. `app/(staff)/layout.tsx` only shows the "Admin — Users"
nav link to admins; `/admin/users` itself redirects a `staff` caller to
`/circulation` as a second check (defense in depth, same pattern as the API
routes having both `requireRole` and an RLS policy).

| Page | Route | Notes |
|---|---|---|
| Circulation Desk | `/circulation` | Staff + Admin. Two-step flow: find a student (search by name/email) → find a book → check out one of its available copies. Server-rendered via `searchParams` and plain GET forms — no client state for the search itself, only the final Checkout/Return buttons (`CheckoutButton.tsx`, `ReturnButton.tsx`) are Client Components. Also lists every active loan (all students) with a Return action. |
| Admin — Users | `/admin/users` | Admin only. Table of every account with a role selector per row (`RoleChangeControl.tsx`) calling `PATCH /api/admin/users/{id}/role`. A user's own row shows "You can't change your own role here" instead of the selector, so an admin can't accidentally lock themselves out. |

Both pages query Supabase directly (not their own API routes) for reads —
`users_select_own_or_staff` already lets staff/admin read every user row,
and `resources`/`copies`/`loans` are readable by any authenticated user —
so no new read endpoints were needed. All writes (checkout, return, role
change) go through the existing API routes, so BR-01/BR-03/AC-03 and the
admin-only role check are enforced in exactly one place each, same as the
Student Dashboard's Reserve/Cancel buttons.

The Student Dashboard sidebar shows a "Staff tools →" link for any
signed-in staff/admin account, and the Staff sidebar shows "← Student
dashboard" — either account type can reach both areas instead of being
walled off.

## Borrow & Reservation workflow (FR-01…FR-07, Hold for Pickup)

Most of this was already in place from the original spec (reservation
queueing, auto-assignment on return, 48h/2-day expiry, cancellation); this
round added self-service borrowing and closed the two gaps in the hold
workflow:

- **FR-01 — self-service Borrow.** `POST /api/loans` now accepts either the
  original staff-checkout shape (`copy_id` + `user_id`, used by Circulation
  Desk's `CheckoutButton`) or a student self-service shape (`resource_id`
  only — the server picks an available copy, retrying on a race with
  another borrower). A student can only ever borrow for themselves; staff
  must say who it's for. Same eligibility re-check and active-loan cap as
  before, in the same route. New `BorrowButton.tsx` on Book Details shows
  when `available_copies > 0`. RLS: `copies_update_self_checkout` and
  `loans_insert_self_or_staff` (`db/schema.sql`) let a student flip a copy
  they're actively borrowing from `available` → `loaned` and insert their
  own loan row — previously both were staff/admin-only, which blocked any
  self-service write under RLS even though the old Circulation-Desk-only
  flow didn't need it.
- **FR-02 — Reserve** (unchanged): `ReserveButton.tsx` + `POST /api/reservations`.
- **FR-03/FR-06 — auto-assign & expiry** (unchanged in behavior, refactored
  for reuse): the "hand a freed copy to the next pending reservation, or
  mark it available" logic used by both the return route and the expiry
  cron is now one function, `releaseCopyToNextInQueue` in
  `lib/services/reservationQueue.ts`, instead of being duplicated.
- **FR-04 — notify on ready, deduped.** `reservation.ready` notifications
  now go through `notifyReservationReadyOnce` in the same file, which
  checks/records `notification_history` before/after calling the
  Notification Hub — previously these events were fire-and-forget with no
  dedup, unlike the loan.due/loan.overdue cron. `notification_history.loan_id`
  is now nullable with a new `reservation_id` column and a
  `(reservation_id, event_type)` unique index, since a reservation.ready
  event isn't tied to a loan.
- **FR-05 — complete checkout for a ready reservation.** This had no
  endpoint or UI at all before — staff could check out any *available*
  copy, but a copy held for a reservation (`status = 'held'`) was
  invisible to that search by design, so there was no way to actually hand
  over a held book. New `POST /api/reservations/{id}/checkout/route.ts`
  (staff-only) verifies the reservation is `ready`, its held copy, and that
  it belongs to the student being served, then creates the loan the same
  way Circulation Desk checkout does. Circulation Desk now shows a "Ready
  for pickup" list for the selected student with a `CompletePickupButton.tsx`.
- **FR-07 — cancel a *ready* reservation, not just a pending one.** Also
  previously missing: `DELETE /api/reservations/{id}` only accepted
  `pending`. It now also accepts `ready`, in which case it releases the
  held copy back through the same `releaseCopyToNextInQueue` queue logic.
  My Reservations shows the Cancel button for both statuses now. Along the
  way this fixed a pre-existing RLS/route mismatch: the DB policy was
  declared `for delete`, but the route has always done an `UPDATE ...
  status = 'cancelled'` (so the row and its notification-dedup history
  survive) — the policy is now correctly declared `for update`.

Book Details also now shows the full FR-01/FR-02 status table: Borrow when
a copy's free, Reserve when none are and nothing's pending, the student's
own queue status when they already have a pending reservation, and a
"Ready for pickup" banner (with the hold deadline) when theirs is ready.

## UI design

A minimal, flat visual style with a red accent, applied through the design
tokens in `app/globals.css` — no component markup changed, since every
card/button/badge already referenced the tokens rather than hardcoded
colors:

- `--color-primary` is red (`#dc2626` light / `#ef4444` dark) — used for
  primary buttons, links, and the notification badge. The existing
  `--color-danger-*` tokens (overdue badges, etc.) stay a separate, slightly
  darker red so the two don't visually collide; they're told apart by shape
  (solid button vs. tinted pill), not just hue.
- `--color-info-*` changed from blue to neutral gray, so the palette reads
  as red + grayscale rather than red competing with a second accent color.
- `--shadow: none` — flat panels/cards with borders doing the work instead
  of drop shadows, set once since every component already used `var(--shadow)`.

**Notifications moved from the sidebar into a corner bell.** Instead of a
"Notifications" nav link, every page under both `(dashboard)` and `(staff)`
now renders a small bell icon fixed to the top-right corner
(`components/NotificationBell.tsx`, `.notif-bell` in `globals.css`), with a
red badge showing the alert count when there is one. It links to the same
`/notifications` page as before. The shared fetch/compute logic was pulled
out of that page into `lib/notifications.ts` (`getNotificationItems`,
wrapped in React `cache()`) so the bell and the page don't duplicate the
query. On narrow screens the bell drops out of `position: fixed` into
normal flow (right-aligned above the collapsed top nav) so it can't overlap
the mobile sidebar row.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase project URL/keys
```

In the Supabase dashboard:
1. **Authentication → Providers → Google**: enable it and add your Google OAuth client ID/secret. Add `https://<your-domain>/auth/callback` (and `http://localhost:3000/auth/callback` for local dev) as a redirect URL.
2. **SQL Editor**: run `db/schema.sql` on a fresh project, then `db/migrations/0001_pg_cron_jobs.sql` (after creating the two Vault secrets described at the top of that file).

```bash
npm run dev
```

## What changed in the 2026-10-29 spec update (and where)

1. **Auth is Google OAuth only**, one "Continue with Google" button for new
   and returning students (no password routes anymore).
   `lib/auth-client.ts` → `app/auth/callback/route.ts` →
   `lib/eligibility.ts` (verifies + persists on `users.eligibility_status`).
   Still to confirm: the university email domain (`UNIVERSITY_EMAIL_DOMAIN`
   in `.env.example` — unset = no domain check yet) and the Student
   Identity service's actual verification requirements.
2. **Student Identity integration** stays server-only
   (`lib/services/studentIdentity.ts`), keyed by `STUDENT_IDENTITY_API_URL`
   / `STUDENT_IDENTITY_API_KEY`, and fails closed (throws → caller treats
   as ineligible) until those are set. Still to confirm: the real
   endpoint, request/response shape, and auth method — this file is the
   one place to update once that's known.
3. **Reservation expiry** moved to Supabase `pg_cron` + `pg_net`, every 5
   minutes, secrets in Vault — `db/migrations/0001_pg_cron_jobs.sql`.
   `vercel.json` is now empty on purpose. The route
   (`app/api/cron/expire-reservations/route.ts`) claims each stale
   reservation with an atomic `UPDATE ... WHERE status = 'ready'`, so
   overlapping or retried runs can't double-process the FIFO queue.
4. **Loan due/overdue notifications**: new daily cron at 09:00 Asia/Bangkok
   (02:00 UTC — scheduled alongside the reservation job in the same
   migration file) hitting `app/api/cron/loan-notifications/route.ts`.
   Dedup is `notification_history` (`db/schema.sql`, unique on
   `loan_id, event_type, sent_on`): a history row is written only after a
   confirmed Notification Hub success, so a failed send is retried on the
   next run without ever double-recording a success. `loan.overdue` stops
   on its own because the query only looks at loans with `returned_at is
   null`.
5. **Staff resource/copy management APIs** — now implemented:
   `POST /resources`, `PATCH /resources/{id}`,
   `GET|POST /resources/{id}/copies`, `GET|PATCH /copies/{id}`. All use
   `requireRole(["staff","admin"])`, backed by the `resources_write_staff_admin`
   / `copies_write_staff_admin` RLS policies in `db/schema.sql`.
   `PATCH /copies/{id}` deliberately refuses to set status to `'loaned'`
   (that must go through `POST /loans`, the only path that also creates the
   matching loan row) and refuses to free a copy that has an active loan.
6. **Loan period & max active loans**: `LOAN_PERIOD_DAYS=14` and
   `MAX_ACTIVE_LOANS=5` in `.env.example` — the max is still undecided per
   the spec ("Still to decide"), 5 is a placeholder single env var to
   change once the team agrees. Enforced in `POST /api/loans` before the
   loan is created.

## Remaining open items

- No screens yet — `app/page.tsx` only has a sign-in button.
- Analytics event sending (FR-09, privacy-minimised) isn't wired into any
  route yet; `lib/services/analytics.ts` is ready to call.
- `lib/eligibility.ts`'s identifier (passed to Student Identity) is the
  user's email until `identity_ref` is populated from a real response —
  confirm this is what the Student Identity service expects once its
  contract is known.
- No automated tests yet. Spec requires at least one per AC-00…AC-10 (11+
  total) before merging to production — `npm run test` runs Vitest, but no
  test files exist.

## Testing

`npm run test` runs Vitest. No tests are included yet.
