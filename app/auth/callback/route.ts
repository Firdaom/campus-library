
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyAndStoreEligibility } from "@/lib/eligibility";

export async function GET(req: Request) {
  const { searchParams, origin } = new URL(req.url);

  const code = searchParams.get("code");

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

  // Read the actual role from the database.
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

  // Student accounts must use the university email domain.
  if (profile.role === "student") {
    const allowedDomain = (
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

    await verifyAndStoreEligibility(
      supabase,
      data.user.id,
      studentId
    );

    return NextResponse.redirect(`${origin}/dashboard`);
  }

  // Staff and Admin automatically enter the Staff Portal.
  return NextResponse.redirect(`${origin}/circulation`);
}
