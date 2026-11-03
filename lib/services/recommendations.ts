import { SupabaseClient } from "@supabase/supabase-js";

/**
 * FR-10 / AC-07: AI recommendations with a deterministic fallback to
 * "popular in this category" when the AI service is unavailable or times out.
 */
export async function getRecommendations(
  supabase: SupabaseClient,
  resourceId: string,
  category: string
) {
  const aiUrl = process.env.AI_RECOMMENDATION_URL;

  if (aiUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${aiUrl}/recommendations?resource_id=${resourceId}`, {
        headers: { Authorization: `Bearer ${process.env.AI_RECOMMENDATION_API_KEY}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        return { source: "ai" as const, resources: data.resources };
      }
    } catch {
      // fall through to deterministic fallback below
    }
  }

  const { data, error } = await supabase
    .from("resource_availability")
    .select("id, title, category, available_copies")
    .eq("category", category)
    .neq("id", resourceId)
    .order("available_copies", { ascending: false })
    .limit(5);

  if (error) throw error;
  return { source: "popular_in_category" as const, resources: data };
}
