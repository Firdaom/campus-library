import Link from "next/link";
import { requireDashboardUser } from "@/lib/currentUser";
import { SearchBox } from "./SearchBox";

// Browse Books: search and browse available books (FR-01, AC-01). Queries
// the same resource_availability view the API's GET /resources uses,
// directly from this Server Component rather than fetching our own route.
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: { q?: string; category?: string };
}) {
  const { supabase } = await requireDashboardUser();

  const { data: categoryRows } = await supabase
    .from("resource_availability")
    .select("category")
    .order("category");

  const categories = [
    ...new Set(
      (categoryRows ?? [])
        .map((item) => item.category)
        .filter((category): category is string => Boolean(category))
    ),
  ];

  const q = searchParams.q?.trim();
  const category = searchParams.category?.trim();


  let query = supabase
    .from("resource_availability")
    .select("*")
    .order("title")
    .limit(50);

  // Search across title, author, category, and description
  if (q) {
    const escapedQ = q
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');

    const pattern = `"%${escapedQ}%"`;

    query = query.or(
      [
        `title.ilike.${pattern}`,
        `author.ilike.${pattern}`,
        `category.ilike.${pattern}`,
        `description.ilike.${pattern}`,
      ].join(",")
    );
  }

  if (category) {
    query = query.eq("category", category);
  }

  const { data: resources, error } = await query;


  return (
    <div>
      <h1>Browse Books</h1>
      <SearchBox
        initialQuery={q}
        initialCategory={category}
        categories={categories}
      />

      {error && <p className="error">{error.message}</p>}

      {category && (
        <p className="muted small" style={{ marginTop: "-0.75rem", marginBottom: "1rem" }}>
          Filtered to category "{category}" —{" "}
          <Link href="/browse" className="link">
            clear filter
          </Link>
        </p>
      )}

      {resources && resources.length > 0 ? (
        <div className="card-grid">
          {resources.map((r: any) => (
            <Link key={r.id} href={`/books/${r.id}`} className="book-card">
              <h3>{r.title}</h3>
              <p className="muted small" style={{ margin: 0 }}>
                {r.category}
                {r.author ? ` · ${r.author}` : ""}
              </p>
              <span className={`badge ${r.available_copies > 0 ? "badge-success" : "badge-muted"}`}>
                {r.available_copies > 0 ? `${r.available_copies} available` : "All copies on loan"}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="muted">No resources match your search.</p>
      )}
    </div>
  );
}
