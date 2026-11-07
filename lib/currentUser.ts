import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Loads the signed-in user for a Server Component, redirecting to "/" if
 * there is no session. Wrapped in React's `cache()` so every Server
 * Component rendered for the same request (layout + page + any nested
 * components) shares one Supabase Auth lookup instead of each calling
 * `auth.getUser()` separately.
 *
 * Every page under app/(dashboard) can call this and assume a signed-in
 * user afterwards — the (dashboard) layout already calls it first, so by
 * the time a page renders the redirect (if any) has already happened.
 */
export const requireDashboardUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  return { supabase, user };
});

/**
 * Same as requireDashboardUser, but also loads the caller's profile
 * (needed for role) and redirects students to their own dashboard rather
 * than letting them render a staff/admin screen. Used by app/(staff)
 * pages — Circulation Desk (FR-03/FR-04) and Admin — Users (FR-11).
 *
 * Returning `profile` here (not just `user`) saves every (staff) page a
 * second query for the caller's own role/name — Admin — Users in
 * particular needs `profile.id` to disable changing your own role.
 */
export const requireStaffUser = cache(async () => {
  const { supabase, user } = await requireDashboardUser();

  const { data: profile } = await supabase
    .from("users")
    .select("id, name, email, role")
    .eq("id", user.id)
    .single();

  if (!profile || !["staff", "admin"].includes(profile.role)) {
    redirect("/dashboard");
  }

  return { supabase, user, profile };
});
