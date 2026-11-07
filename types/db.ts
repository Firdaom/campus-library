export type UserRole = "student" | "staff" | "admin";
export type UserStatus = "active" | "suspended";
export type EligibilityStatus = "unverified" | "eligible" | "ineligible";
export type CopyStatus = "available" | "loaned" | "held";
export type LoanStatus = "active" | "returned";
export type ReservationStatus = "pending" | "ready" | "cancelled" | "expired" | "fulfilled";
export type NotificationEventType = "loan.due" | "loan.overdue" | "reservation.ready";

export interface User {
  id: string;
  name: string;
  email: string;
  identity_ref: string | null;
  role: UserRole;
  status: UserStatus;
  eligibility_status: EligibilityStatus;
  eligibility_checked_at: string | null;
  created_at: string;
}

export interface NotificationHistoryEntry {
  id: string;
  loan_id: string | null;
  reservation_id: string | null; // set instead of loan_id for reservation.ready (FR-04)
  event_type: NotificationEventType;
  sent_on: string | null; // date, YYYY-MM-DD — loan events only
  created_at: string;
}

export interface Resource {
  id: string;
  title: string;
  category: string;
  author: string | null;
  description: string | null;
  available_copies?: number;
  total_copies?: number;
}

export interface Copy {
  id: string;
  resource_id: string;
  status: CopyStatus;
}

export interface Loan {
  id: string;
  copy_id: string;
  user_id: string;
  borrowed_at: string;
  due_at: string;
  returned_at: string | null;
  status: LoanStatus;
}

export interface Reservation {
  id: string;
  resource_id: string;
  user_id: string;
  status: ReservationStatus;
  created_at: string;
  ready_at: string | null;
  expires_at: string | null;
  held_copy_id: string | null;
}

export type RecommendationResource = Pick<Resource, "id" | "title" | "category">;
