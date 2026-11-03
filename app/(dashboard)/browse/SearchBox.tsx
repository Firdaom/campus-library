"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Client Component for just the search input — the results list stays a
// Server Component (app/(dashboard)/browse/page.tsx) so the query hits
// Supabase directly instead of round-tripping through the browser.
export function SearchBox({ initialQuery, initialCategory }: { initialQuery?: string; initialCategory?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (initialCategory) params.set("category", initialCategory);
    router.push(`/browse${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <form className="search-box" onSubmit={handleSubmit} role="search">
      <input
        type="search"
        placeholder="Search by title..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search resources by title"
      />
      <button type="submit" className="btn btn-primary">
        Search
      </button>
    </form>
  );
}
