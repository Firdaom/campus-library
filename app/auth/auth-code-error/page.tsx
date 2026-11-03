// Shown when the Google OAuth callback fails (bad/expired code, or the
// account's email domain doesn't match UNIVERSITY_EMAIL_DOMAIN).
export default function AuthCodeErrorPage({
  searchParams,
}: {
  searchParams: { reason?: string };
}) {
  const message =
    searchParams.reason === "domain"
      ? "Please sign in with your university Google account."
      : "Sign-in failed. Please try again.";

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>Couldn&apos;t sign you in</h1>
      <p>{message}</p>
      <a href="/">Back to sign in</a>
    </main>
  );
}
