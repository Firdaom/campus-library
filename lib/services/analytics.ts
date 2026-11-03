/**
 * Analytics — receives privacy-minimised usage events only (section 12,
 * Data Protection). Never send name, identity_ref, or raw user_id here;
 * hash or drop identifiers before sending.
 */
export async function trackEvent(eventName: string, props: Record<string, unknown>) {
  const url = process.env.ANALYTICS_URL;
  if (!url) return;

  try {
    await fetch(`${url}/track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.ANALYTICS_API_KEY}`,
      },
      body: JSON.stringify({ event: eventName, props, ts: new Date().toISOString() }),
    });
  } catch (err) {
    // Non-critical dependency (NFR-03) — never throw.
    console.error("[analytics] track error:", err);
  }
}
