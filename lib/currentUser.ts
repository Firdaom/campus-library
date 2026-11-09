
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Shared authenticated user and profile lookup.
 * Cached per request to avoid duplicate Supabase queries.
 */
const getCurrentUser = cache(async () => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const { data: profile, error } = await supabase
    .from("users")
    .select("id, name, email, role")
    .eq("id", user.id)
    .single();

  if (
    error ||
    !profile ||
    !["student", "staff", "admin"].includes(profile.role)
  ) {
    redirect("/auth/auth-code-error");
  }

  return { supabase, user, profile };
});

/**
 * Student Portal only.
 * Staff/Admin accounts are redirected to the Staff Portal.
 */
export const requireDashboardUser = cache(async () => {
  const { supabase, user, profile } = await getCurrentUser();

  if (profile.role !== "student") {
    redirect("/circulation");
  }

  return { supabase, user };
});

/**
 * Staff Portal only.
 * Students are redirected to their own dashboard.
 */
export const requireStaffUser = cache(async () => {
  const { supabase, user, profile } = await getCurrentUser();

  if (!["staff", "admin"].includes(profile.role)) {
    redirect("/dashboard");
  }

  return { supabase, user, profile };
});
