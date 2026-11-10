
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function SearchBox({
  initialQuery,
  initialCategory,
  categories,
}: {
  initialQuery?: string;
  initialCategory?: string;
  categories: string[];
}) {
  const router = useRouter();

  const [q, setQ] = useState(initialQuery ?? "");
  const [category, setCategory] = useState(initialCategory ?? "");

  useEffect(() => {
    const normalizedQuery = q.trim();
    const normalizedCategory = category.trim();

    // Avoid navigation when the URL already represents this search.
    if (
      normalizedQuery === (initialQuery ?? "") &&
      normalizedCategory === (initialCategory ?? "")
    ) {
      return;
    }

    const timer = setTimeout(() => {
      const params = new URLSearchParams();

      if (normalizedQuery) {
        params.set("q", normalizedQuery);
      }

      if (normalizedCategory) {
        params.set("category", normalizedCategory);
      }

      const queryString = params.toString();

      router.replace(
        `/browse${queryString ? `?${queryString}` : ""}`,
        { scroll: false }
      );
    }, 300);

    return () => clearTimeout(timer);
  }, [q, category, initialQuery, initialCategory, router]);

  return (
    <form
      className="search-box"
      role="search"
      onSubmit={(e) => e.preventDefault()}
    >
      <input
        type="search"
        placeholder="Search by title, author, category, or description..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search resources"
      />

      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        aria-label="Filter by category"
      >
        <option value="">All categories</option>

        {categories.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </form>
  );
}
