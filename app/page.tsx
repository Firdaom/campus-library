import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignInButton } from "./SignInButton";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role === "staff" || profile?.role === "admin") {
      redirect("/circulation");
    }

    if (profile?.role === "student") {
      redirect("/dashboard");
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-showcase" aria-label="Campus Library introduction">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span>Campus Library</span>
        </div>

        <div className="auth-copy">
          <p className="eyebrow">YOUR CAMPUS, BETWEEN THE COVERS</p>
          <h1>A little more room for <em>curiosity.</em></h1>
          <p className="auth-description">
            Find your next read, keep your loans in order, and save a place in line for the books everyone wants.
          </p>
        </div>

        <div className="book-art" aria-hidden="true">
          <span className="book-art-glow" />
          <span className="book book-back"><span>FIELD NOTES</span></span>
          <span className="book book-middle"><span>THE ART OF<br />LEARNING</span></span>
          <span className="book book-front"><span>READ<br />WANDER<br />REPEAT</span></span>
          <span className="book-art-caption">A whole world, waiting on campus.</span>
        </div>
      </section>

      <section className="auth-panel" aria-label="Sign in">
        <div className="auth-card">
          <p className="eyebrow">WELCOME BACK</p>
          <h2>Make yourself at home.</h2>
          <p>Sign in with your Google account to continue.</p>

          <SignInButton />

          <div className="auth-divider">
            <span>YOUR LIBRARY, IN ONE PLACE</span>
          </div>

          <ul className="auth-benefits">
            <li><span aria-hidden="true">01</span> Discover books in the campus collection</li>
            <li><span aria-hidden="true">02</span> Keep track of loans and due dates</li>
            <li><span aria-hidden="true">03</span> Reserve books that are checked out</li>
          </ul>

          <p className="auth-footnote">
            For students, staff, and the joy of a good book.
          </p>
        </div>
      </section>
    </main>
  );
}