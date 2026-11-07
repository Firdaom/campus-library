import Link from "next/link";
import { requireDashboardUser } from "@/lib/currentUser";
import { SearchBox } from "./SearchBox";

// Browse Books: search and browse available books (FR-01, AC-01). Queries
// the same resource_availability view the API's GET /resources uses,
// directly from this Server Component rather than fetching our own route.
export default async function BrowsePage(
  props: {
    searchParams: Promise<{ q?: string; category?: string }>;
  }
) {
  const searchParams = await props.searchParams;
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
      <header className="page-heading catalog-heading">
        <div>
          <p className="eyebrow">THE CAMPUS COLLECTION</p>
          <h1>Find your next read.</h1>
          <p className="page-intro">A good book has a way of taking you somewhere. Start exploring.</p>
        </div>
        {resources && !error && (
          <span className="catalog-count">
            <strong>{resources.length}</strong>
            {resources.length === 1 ? " title" : " titles"}
          </span>
        )}
      </header>
      <SearchBox
        initialQuery={q}
        initialCategory={category}
        categories={categories}
      />

      {error && <p className="error">{error.message}</p>}

      {category && (
        <p className="muted small" style={{ marginTop: "-0.75rem", marginBottom: "1rem" }}>
          Filtered to category &quot;{category}&quot; —{" "}
          <Link href="/browse" className="link">
            clear filter
          </Link>
        </p>
      )}

      {resources && resources.length > 0 ? (
        <div className="card-grid">
          {resources.map((r: any) => (
            <Link key={r.id} href={`/books/${r.id}`} className="book-card">
              <span className="book-cover" aria-hidden="true">
                <span className="book-cover-lines" />
                <span className="book-cover-mark">CL</span>
              </span>
              <span className="book-card-content">
                <span className="book-category">{r.category}</span>
                <strong className="book-title">{r.title}</strong>
                <span className="book-author">{r.author || "Campus collection"}</span>
                <span className={`badge ${r.available_copies > 0 ? "badge-success" : "badge-muted"}`}>
                  <span className="availability-dot" aria-hidden="true" />
                  {r.available_copies > 0 ? `${r.available_copies} available` : "Currently on loan"}
                </span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <section className="empty-state">
          <span className="empty-state-mark" aria-hidden="true">⌕</span>
          <h2>No titles found</h2>
          <p>Try a different search, or clear your filters to explore the full collection.</p>
          <Link href="/browse" className="btn btn-secondary">Show all books</Link>
        </section>
      )}
    </div>
  );
}
