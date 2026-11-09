
import Link from "next/link";

// Shown when the Google OAuth callback fails.
export default async function AuthCodeErrorPage(
  props: {
    searchParams: Promise<{ reason?: string }>;
  }
) {
  const searchParams = await props.searchParams;

  let message = "Sign-in failed. Please try again.";

  if (searchParams.reason === "domain") {
    message = "Please sign in with your university Google account.";
  } else if (searchParams.reason === "portal-mismatch") {
    message =
      "Your account does not have access to the selected portal. Please choose the correct portal or contact a library administrator.";
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem" }}>
      <h1>Couldn&apos;t sign you in</h1>
      <p>{message}</p>
      <Link href="/">Back to sign in</Link>
    </main>
  );
}
