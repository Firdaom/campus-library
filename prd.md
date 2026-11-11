# Campus Library Product Requirements Document

## 1. Product summary

**Product:** Campus Library Loan & Reservation System  
**Product type:** Responsive web application  
**Primary users:** Students, library staff, and administrators

Campus Library is a digital interface for discovering the campus book collection, borrowing available copies, reserving unavailable books, and managing circulation. Students use the dashboard to track their loans and reservations. Staff use the circulation desk to check books in and out, including completing pickup of reserved books. Administrators can manage user roles.

This document describes the functionality present in the repository. It distinguishes working application features from integrations or screens that still require configuration or implementation.

## 2. Product goals

- Let eligible campus members find books and see copy availability.
- Support self-service borrowing and reservations, with clear loan and pickup status.
- Give students a reliable view of due dates, overdue loans, and reservation updates.
- Give staff a straightforward workflow for circulation and returns.
- Restrict administrative and data access according to account role and ownership.

## 3. User roles

| Role | Capabilities |
|---|---|
| Student | Browse and search the collection; borrow available books; reserve unavailable books; view and cancel their reservations; view their loans, notifications, and profile. |
| Staff | Use student features for their own account; search for students; check books out and in; complete ready reservation pickups; access staff circulation tools. |
| Admin | All staff capabilities, plus view user accounts and change other users' roles. An admin cannot change their own role through the admin screen. |

New accounts default to the student role. Staff and admin roles are assigned by an admin. Suspended accounts are denied access to protected API operations.

## 4. Frontend requirements and routes

### Public and authentication screens

| Route | Requirements |
|---|---|
| `/` | Present the Campus Library introduction and a Google sign-in action. Redirect an already signed-in user to `/dashboard`. |
| `/auth/callback` | Complete the Supabase Google OAuth flow, optionally enforce the configured university email domain, and check borrowing eligibility. |
| `/auth/auth-code-error` | Display the authentication error state when OAuth callback processing fails. |

### Student dashboard

All student dashboard routes require a signed-in account. The interface uses a shared sidebar, account information, sign-out control, and a notification bell.

| Route | Requirements |
|---|---|
| `/dashboard` | Show active-loan, overdue, due-within-three-days, and reservation counts; upcoming loan due dates; and ready-for-pickup reservations. Provide links to browse and view loans. |
| `/browse` | Search by title, author, category, or description; filter by category; show matching titles and available-copy counts; link to book details. Results are limited to 50 titles. |
| `/books/[id]` | Show book details and copy availability. Offer Borrow when copies are available, Reserve when copies are unavailable, and the user's reservation/pickup status when applicable. Show recommendations when available. |
| `/loans` | List the signed-in user's loan history, borrowed and due dates, and Active, Overdue, or Returned status. |
| `/reservations` | List the signed-in user's reservations, FIFO queue position for pending reservations, ready/expiry status, and cancellation actions for pending or ready reservations. |
| `/notifications` | Show current loan and reservation alerts. This route is reached through the notification bell rather than a sidebar item. |
| `/profile` | Show the user's account information and read-only borrowing eligibility status and last verification time. |

### Staff and administrator screens

Staff routes require a staff or admin role. Staff users are redirected away from administrator-only pages.

| Route | Requirements |
|---|---|
| `/circulation` | Search students by name or email, select a student, search for a title, check out an available copy, complete the selected student's ready reservation pickup, and view active loans across users with return actions. |
| `/admin/users` | Admin-only table of user accounts, account status, eligibility, and role. Allow changing another user's role. |

Staff and admin users can navigate between the staff tools and their own student dashboard.

## 5. Functional requirements

### Authentication and eligibility

- Use Google OAuth through Supabase; there are no separate password registration or login screens.
- Create a student profile on first sign-in.
- If `UNIVERSITY_EMAIL_DOMAIN` is configured, reject Google accounts outside that domain. If it is unset, the domain restriction is not enforced.
- Check eligibility at sign-in and again when a loan is attempted.
- Fail closed for borrowing: if the Student Identity check fails or is unavailable, the user is treated as ineligible and borrowing is blocked.
- Display eligibility status to the user and staff where relevant.

### Catalog and recommendations

- Read catalog titles and copy availability from the Supabase-backed collection.
- Support title, author, category, and description search and category filtering.
- Show a book's description, author, category, total copies, and available copies when those fields exist.
- Prefer AI recommendations when the configured recommendation service responds successfully. Otherwise show popular titles from the same category.

### Borrowing and loans

- Eligible students can borrow an available copy for themselves.
- The server selects an available copy for self-service borrowing and handles copy contention.
- Staff can check out an available copy to a selected student.
- Enforce eligibility and the active-loan limit at loan creation time.
- Calculate due dates using the configured loan period.
- Show active, overdue, and returned loan states to the borrower.
- Staff can return active loans; returning a copy can make it available to the next reservation in line.

### Reservations and pickup

- A student can reserve a title when no copies are available.
- Prevent duplicate pending reservations by the same user for the same title.
- Order pending reservations FIFO.
- When a copy is released, assign it to the next pending reservation where applicable and mark that reservation ready.
- Hold a ready copy for 48 hours. If it is not collected in time, expire the reservation and process the next eligible reservation.
- Let students cancel pending or ready reservations. Releasing a ready hold must preserve queue handling.
- Let staff complete pickup for a ready reservation and create the corresponding loan.

### Notifications

- Derive the in-app alert list from the user's current loans and reservations so it reflects their current state.
- Show an alert count in the notification bell when alerts exist.
- Send due, overdue, and reservation-ready events to the configured Notification Hub.
- Deduplicate scheduled notifications so a successfully delivered event is not recorded or sent repeatedly for the same applicable period.
- Notification delivery must not prevent a loan, return, or reservation operation from completing.

### Staff administration

- Permit staff and admins to read the information needed for circulation and view active loans across users.
- Permit admins to change another user's role.
- Do not offer a self-service role change for the current admin.
- Resource and copy create/update endpoints are available to staff/admin through the API, but the application currently has no catalog-management UI.

## 6. Business rules and defaults

| Rule | Current behavior |
|---|---|
| Loan period | `LOAN_PERIOD_DAYS` defaults to 14. |
| Maximum active loans | `MAX_ACTIVE_LOANS` defaults to 5; this value is documented as a placeholder pending a product decision. |
| Reservation order | FIFO by reservation creation time. |
| Ready reservation hold | 48 hours from the time the reservation becomes ready. |
| Reservation expiry schedule | Supabase scheduled job runs every five minutes. |
| Loan notification schedule | Supabase scheduled job runs daily at 09:00 Asia/Bangkok. |
| Availability | Only copies with `available` status can be borrowed through ordinary checkout. Held copies are reserved for pickup. |
| Data access | Supabase Row-Level Security scopes student data to the owner and permits staff/admin access where required. |

Loan and limit values are environment-configurable; the values above are defaults, not a confirmation of final library policy.

## 7. UX and visual requirements

- Use a responsive layout with a persistent desktop sidebar and a compact mobile navigation layout.
- Use the shared design system in `app/globals.css`, including light and dark color schemes, status badges, forms, cards, and tables.
- Keep core actions apparent on relevant screens: browse from the dashboard, borrow/reserve from book details, cancel from reservations, and circulate from the staff desk.
- Communicate empty states and action status, including unavailable books, overdue loans, ready pickup deadlines, and failed authentication.
- Respect reduced-motion preferences.

## 8. Application and data requirements

- Implement the web application with Next.js App Router, React, TypeScript, and Supabase.
- Use server-rendered pages and session-bound Supabase access for authenticated data reads.
- Expose API routes for loans, returns, reservations, reservation checkout, catalog resources, copies, admin role changes, and scheduled jobs.
- Validate API inputs with the shared schemas and enforce role/ownership requirements in the application and database policies.
- Keep service-role credentials and external service API keys on the server; never expose them as public client variables.
- Use database constraints and atomic operations to protect loan/copy consistency, queue transitions, duplicate reservations, and notification deduplication.

## 9. External services and operational dependencies

- **Supabase:** Authentication, PostgreSQL database, Row-Level Security, and scheduled job support.
- **Google OAuth:** Sign-in provider configured in Supabase.
- **Student Identity:** Eligibility verification. The endpoint and contract must be supplied and configured before borrowing can be enabled in production.
- **Notification Hub:** External due, overdue, and reservation-ready event delivery. Requires server-side URL and API key configuration.
- **AI recommendations:** Optional service. The application falls back to same-category popularity when unavailable or not configured.
- **Analytics:** An analytics service helper exists, but analytics event sending is not wired to an application route.
- **Scheduled jobs:** Supabase `pg_cron`/`pg_net` configuration and Vault secrets are required for automatic reservation expiry and loan notifications.

## 10. Known gaps and decisions

- Confirm the university email domain and configure the server-side domain check.
- Implement and confirm the Student Identity integration contract. Until then, fail-closed eligibility checks block borrowing.
- Configure and verify the Notification Hub before relying on external notifications.
- Decide the final maximum active-loan limit.
- Add catalog-management screens if staff need to create or edit resources and copies without using the API.
- Wire analytics event sending if required by the product specification.
- Add acceptance coverage for complete student and staff workflows; current tests cover selected helpers and API schemas, not all acceptance criteria.

## 11. Acceptance criteria

1. A signed-out visitor can start Google sign-in; a successful sign-in reaches the dashboard, and a failed callback reaches an error state.
2. Authenticated users can search/filter catalog titles and open a title's detail page with current availability.
3. An eligible student can borrow an available title, and the resulting loan appears in My Loans with its due date.
4. An ineligible or unverifiable student cannot borrow; a copy cannot be loaned to two users simultaneously.
5. A student can reserve an unavailable title, see their FIFO queue position, and cancel a pending reservation.
6. When a copy becomes available for a pending reservation, the next reservation becomes ready and the copy is held for that user.
7. A ready reservation can be cancelled or completed as a staff pickup; an unclaimed hold expires after 48 hours and the queue proceeds.
8. Students see their own loan/reservation alerts and records, not another user's private records.
9. Staff can check out and return copies and complete a selected student's ready pickup.
10. Admins can change another user's role; staff cannot access the admin screen, and admins cannot change their own role through that screen.
11. Scheduled jobs and external notifications operate only when their required Supabase and service configuration is present; delivery failures do not roll back circulation actions.
