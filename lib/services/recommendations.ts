import { SupabaseClient } from "@supabase/supabase-js";
import type { RecommendationResource } from "@/types/db";

/**
 * FR-10 / AC-07: AI recommendations with a deterministic fallback to
 * "popular in this category" when the AI service is unavailable or times out.
 */
export async function getRecommendations(
  supabase: SupabaseClient,
  resourceId: string,
  category: string
): Promise<{ source: "ai" | "popular_in_category"; resources: RecommendationResource[] }> {
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
        const data = (await res.json()) as { resources: RecommendationResource[] };
        return { source: "ai", resources: data.resources };
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
