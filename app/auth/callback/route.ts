
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyAndStoreEligibility } from "@/lib/eligibility";

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);

  const code = searchParams.get("code");
  const portal = searchParams.get("portal");

  // Accept only the two supported portal values.
  if (portal !== "student" && portal !== "staff") {
    return NextResponse.redirect(
      `${origin}/auth/auth-code-error`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/auth/auth-code-error`
    );
  }

  const supabase = await createClient();

  const { data, error } =
    await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(
      `${origin}/auth/auth-code-error`
    );
  }

  const email = data.user.email ?? "";

  // Load the actual role from the database.
  // Portal selection must never grant or change a user's role.
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (
    profileError ||
    !profile ||
    !["student", "staff", "admin"].includes(profile.role)
  ) {
    await supabase.auth.signOut();

    return NextResponse.redirect(
      `${origin}/auth/auth-code-error`
    );
  }

  const isStudent = profile.role === "student";
  const isStaffOrAdmin =
    profile.role === "staff" || profile.role === "admin";

  // Reject accounts attempting to enter the wrong portal.
  if (
    (portal === "student" && !isStudent) ||
    (portal === "staff" && !isStaffOrAdmin)
  ) {
    await supabase.auth.signOut();

    return NextResponse.redirect(
      `${origin}/auth/auth-code-error?reason=portal-mismatch`
    );
  }

  // Student accounts must use the university email domain.
  // Staff and Admin accounts may use personal email addresses.
  if (isStudent) {
    const allowedDomain =
      (
        process.env.UNIVERSITY_EMAIL_DOMAIN ??
        "lamduan.mfu.ac.th"
      ).toLowerCase();

    const emailParts = email.toLowerCase().split("@");

    const isUniversityEmail =
      emailParts.length === 2 &&
      emailParts[1] === allowedDomain;

    if (!isUniversityEmail) {
      await supabase.auth.signOut();

      return NextResponse.redirect(
        `${origin}/auth/auth-code-error?reason=domain`
      );
    }

    // Extract the 10-digit Student ID from the university email.
    const studentId = /^\d{10}$/.test(emailParts[0])
      ? emailParts[0]
      : "";

    // Invalid ID format or unavailable API fails closed.
    // The borrowing endpoint performs its own eligibility check.
    await verifyAndStoreEligibility(
      supabase,
      data.user.id,
      studentId
    );

    return NextResponse.redirect(`${origin}/dashboard`);
  }

  // Both Staff and Admin enter the Staff Portal.
  // Student Identity verification does not apply to them.
  return NextResponse.redirect(`${origin}/circulation`);
}
