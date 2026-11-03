import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignInButton } from "./SignInButton";

// FR-00 (2026-10-29 update): one "Continue with Google" button for both new
// and returning students. Already-signed-in visitors go straight to the
// dashboard rather than seeing the sign-in screen again.
export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <main className="auth-screen">
      <div className="auth-card">
        <h1>Campus Library</h1>
        <p>Sign in with your university Google account to search, borrow, and reserve books.</p>
        <SignInButton />
      </div>
    </main>
  );
}
