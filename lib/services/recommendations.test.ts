import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getRecommendations } from "./recommendations";

const recommendations = [
  { id: "recommended-1", title: "Suggested title", category: "science" },
];

function createSupabaseMock(data = recommendations) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    neq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.neq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockResolvedValue({ data, error: null });

  return {
    client: { from: vi.fn(() => query) } as unknown as SupabaseClient,
    query,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getRecommendations", () => {
  it("uses AI recommendations when the configured service succeeds", async () => {
    vi.stubEnv("AI_RECOMMENDATION_URL", "https://recommendations.example");
    const aiResources = [{ id: "ai-1", title: "AI pick", category: "science" }];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ resources: aiResources }),
      })
    );
    const { client, query } = createSupabaseMock();

    await expect(getRecommendations(client, "resource-1", "science")).resolves.toEqual({
      source: "ai",
      resources: aiResources,
    });
    expect(query.limit).not.toHaveBeenCalled();
  });

  it("falls back to popular resources when the AI service is unavailable", async () => {
    vi.stubEnv("AI_RECOMMENDATION_URL", "https://recommendations.example");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const { client, query } = createSupabaseMock();

    await expect(getRecommendations(client, "resource-1", "science")).resolves.toEqual({
      source: "popular_in_category",
      resources: recommendations,
    });
    expect(client.from).toHaveBeenCalledWith("resource_availability");
    expect(query.eq).toHaveBeenCalledWith("category", "science");
    expect(query.neq).toHaveBeenCalledWith("id", "resource-1");
    expect(query.limit).toHaveBeenCalledWith(5);
  });
});
