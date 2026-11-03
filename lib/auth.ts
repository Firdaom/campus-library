import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export type Role = "student" | "staff" | "admin";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Loads the authenticated user and their profile row (role/status).
 * Throws a 401 ApiError if there is no session.
 *
 * NOTE: this reads the caller's own profile, which RLS always permits
 * (see users_select_own_or_staff policy), so it works for every role.
 */
export async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new ApiError(401, "Not authenticated.");

  const { data: profile, error } = await supabase
    .from("users")
    .select("id, name, email, role, status, eligibility_status")
    .eq("id", user.id)
    .single();

  if (error || !profile) throw new ApiError(401, "User profile not found.");
  if (profile.status === "suspended") throw new ApiError(403, "Account suspended.");

  return { supabase, user, profile };
}

/** Same as requireUser, but also enforces the caller's role is in `roles`. */
export async function requireRole(roles: Role[]) {
  const ctx = await requireUser();
  if (!roles.includes(ctx.profile.role as Role)) {
    throw new ApiError(403, `Requires role: ${roles.join(" or ")}.`);
  }
  return ctx;
}

/** Wraps a Route Handler body, converting ApiError into a JSON response. */
export function withApiErrors(
  handler: (req: Request, ctx: any) => Promise<Response>
) {
  return async (req: Request, ctx: any) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error(err);
      return NextResponse.json({ error: "Internal server error." }, { status: 500 });
    }
  };
}
