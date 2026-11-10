import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireDashboardUser } from "@/lib/currentUser";
import { getRecommendations } from "@/lib/services/recommendations";
import { ReserveButton } from "./ReserveButton";
import { BorrowButton } from "./BorrowButton";

// Book Details: detailed info, copy count, and availability status (FR-02),
// plus related-resource recommendations with the popular-in-category
// fallback (FR-10, AC-07). The action shown follows the FR-01/FR-02
// "Expected Book Details Page Behavior" table: Borrow when a copy's
// available, Reserve when none are, the student's own reservation status
// (pending queue position or ready-for-pickup) when they already have one,
// and an unavailable message when the resource has no copies at all.
export default async function BookDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { supabase, user } = await requireDashboardUser();

  // The three lookups are independent, so run them in parallel.
  const [{ data: resource }, { data: copies }, { data: existingReservation }] = await Promise.all([
    supabase.from("resources").select("*").eq("id", params.id).single(),
    supabase.from("copies").select("id, status").eq("resource_id", params.id),
    supabase
      .from("reservations")
      .select("id, status, expires_at")
      .eq("resource_id", params.id)
      .eq("user_id", user.id)
      .in("status", ["pending", "ready"])
      .maybeSingle(),
  ]);
  if (!resource) notFound();

  const totalCopies = copies?.length ?? 0;
  const availableCopies = (copies ?? []).filter((c) => c.status === "available").length;

  return (
    <div>
      <Link href="/browse" className="link">
        ← Back to browse
      </Link>

      <h1 style={{ marginTop: "0.75rem" }}>{resource.title}</h1>
      <p className="muted">
        {resource.category}
        {resource.author ? ` · ${resource.author}` : ""}
      </p>
      {resource.description && <p>{resource.description}</p>}

      <section className="panel">
        <h2>Availability</h2>
        <p>
          {availableCopies > 0
            ? `${availableCopies} of ${totalCopies} ${totalCopies === 1 ? "copy" : "copies"} available`
            : totalCopies > 0
              ? `All ${totalCopies} ${totalCopies === 1 ? "copy is" : "copies are"} currently on loan`
              : "No copies of this resource exist yet."}
        </p>
        {availableCopies > 0 && <BorrowButton resourceId={resource.id} />}

        {availableCopies === 0 && totalCopies > 0 && existingReservation?.status === "ready" && (
          <p className="notification notification-success" style={{ marginTop: "0.5rem" }}>
            <strong>Ready for pickup</strong>
            <span>
              Hold expires{" "}
              {existingReservation.expires_at ? new Date(existingReservation.expires_at).toLocaleString() : "soon"}.
              Collect it at the Circulation Desk.
            </span>
          </p>
        )}

        {availableCopies === 0 && totalCopies > 0 && existingReservation?.status !== "ready" && (
          <ReserveButton resourceId={resource.id} alreadyReserved={existingReservation?.status === "pending"} />
        )}
      </section>

      {/* Streamed in separately so a slow AI recommendation call (up to its 3s
          timeout) never delays the rest of the page. Renders nothing while
          loading and nothing on failure, same as before. */}
      <Suspense fallback={null}>
        <Recommendations supabase={supabase} resourceId={resource.id} category={resource.category} />
      </Suspense>
    </div>
  );
}

// getRecommendations already falls back to "popular in category" on any
// AI failure (FR-10) — this try/catch only guards an unexpected throw
// (e.g. the fallback query itself erroring) so a broken recommendation
// panel never takes down the whole page.
async function Recommendations({
  supabase,
  resourceId,
  category,
}: {
  supabase: SupabaseClient;
  resourceId: string;
  category: string;
}) {
  let recommendations: Awaited<ReturnType<typeof getRecommendations>> | null = null;
  try {
    recommendations = await getRecommendations(supabase, resourceId, category);
  } catch {
    recommendations = null;
  }

  return (
    <>
      {recommendations && recommendations.resources && recommendations.resources.length > 0 && (
      <section className="panel">
        <h2>You might also like</h2>
        <p className="muted small" style={{ marginTop: "-0.4rem" }}>
          {recommendations.source === "ai" ? "Suggested for you" : "Popular in this category"}
        </p>
        <div className="card-grid">
          {recommendations.resources.map((r: any) => (
            <Link key={r.id} href={`/books/${r.id}`} className="book-card">
              <h3>{r.title}</h3>
              <p className="muted small" style={{ margin: 0 }}>
                {r.category}
              </p>
            </Link>
          ))}
        </div>
      </section>
    )}
    </>
  );
}
