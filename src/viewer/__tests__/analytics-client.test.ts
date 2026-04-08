/**
 * AnalyticsClient — Unit Tests (real buildHeaders + fetchOverview)
 *
 * Tests the REAL AnalyticsClient class, not reimplementations.
 * Covers: buildHeaders auth requirement, fetchOverview modes, cache, error handling.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { syncSessionToLegacyStorage, clearAuthStorage } from "../auth-storage";

// We test AnalyticsClient indirectly since buildHeaders is private.
// Strategy: set up storage, instantiate client, call fetchOverview with mocked fetch.

describe("AnalyticsClient — buildHeaders via fetchOverview", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("fetchOverview throws when no auth token (real buildHeaders path)", async () => {
    // No token in storage → buildHeaders must throw
    vi.stubEnv("VITE_ANALYTICS_MODE", "api");

    const { AnalyticsClient } = await import("../analytics-client");
    const client = new AnalyticsClient();

    await expect(client.fetchOverview()).rejects.toThrow(/Auth|token|login/i);
    // fetch should NOT have been called
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetchOverview sends Authorization header when token exists", async () => {
    syncSessionToLegacyStorage({ access_token: "test-jwt-123" });

    const mockResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          generated_at: "2026-03-07",
          user_id: "u1",
          range: { from: "2026-02-05", to: "2026-03-07" },
          kpis: { sessions_7d: 0, sessions_30d: 0, attempts_7d: 0, attempts_30d: 0, practice_time_7d_sec: 0, accuracy_avg: 0, latency_avg: 0, best_streak: 0, best_score: 0 },
          daily: [],
          chapters: [],
          global_heatmap: [],
          global_heatmap_top_notes: [],
          error_pairs: [],
          suggestions: [],
          unlocks: [],
        }),
    };

    (fetch as any).mockResolvedValue(mockResponse);

    const { AnalyticsClient } = await import("../analytics-client");
    const client = new AnalyticsClient();
    const { stats, source } = await client.fetchOverview();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = (fetch as any).mock.calls[0];
    expect(url).toContain("analytics/overview");
    expect(opts.headers.get("Authorization")).toBe("Bearer test-jwt-123");
    expect(source).toBe("api");
    expect(stats.user_id).toBe("u1");
  });

  it("fetchOverview returns controlled error on 401", async () => {
    syncSessionToLegacyStorage({ access_token: "expired-jwt" });

    (fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
    });

    const { AnalyticsClient } = await import("../analytics-client");
    const client = new AnalyticsClient();

    await expect(client.fetchOverview()).rejects.toThrow(/401|Autenticação/i);
  });

  it("fetchOverview handles network failure gracefully", async () => {
    syncSessionToLegacyStorage({ access_token: "valid-jwt" });

    (fetch as any).mockRejectedValue(new TypeError("Failed to fetch"));

    const { AnalyticsClient } = await import("../analytics-client");
    const client = new AnalyticsClient();

    await expect(client.fetchOverview()).rejects.toThrow(/rede|offline|fetch/i);
  });

  it("API failure with static fallback enabled falls back to static", async () => {
    syncSessionToLegacyStorage({ access_token: "fallback-jwt" });

    const fallbackData = {
      generated_at: "2026-01-01",
      user_id: "static",
      range: { from: "2025-12-01", to: "2026-01-01" },
      kpis: { sessions_7d: 1, sessions_30d: 5, attempts_7d: 10, attempts_30d: 50, practice_time_7d_sec: 300, accuracy_avg: 0.8, latency_avg: 100, best_streak: 3, best_score: 10 },
      daily: [],
      chapters: [],
      global_heatmap: [],
      global_heatmap_top_notes: [],
      error_pairs: [],
      suggestions: [],
      unlocks: [],
    };

    // API fails (first call), fallback succeeds (second call)
    (fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(fallbackData),
      });

    // Mock getConfig to enable static fallback
    const configMod = await import("../../config/app-config");
    const spy = vi.spyOn(configMod, "getConfig").mockReturnValue({
      supabaseUrl: "",
      supabaseAnonKey: "",
      apiBaseUrl: "https://api.test.com",
      analyticsApiUrl: "https://api.test.com",
      analyticsMode: "api",
      enableStaticFallback: true,
      proxyBaseUrl: "",
      proxyAnonKey: "",
    });

    const { AnalyticsClient } = await import("../analytics-client");
    const client = new AnalyticsClient();
    const { source } = await client.fetchOverview();
    expect(source).toBe("static");

    spy.mockRestore();
  });

  it("analyticsMode=off throws immediately without fetch", async () => {
    const configMod = await import("../../config/app-config");
    const spy = vi.spyOn(configMod, "getConfig").mockReturnValue({
      supabaseUrl: "",
      supabaseAnonKey: "",
      apiBaseUrl: "",
      analyticsApiUrl: "",
      analyticsMode: "off",
      enableStaticFallback: false,
      proxyBaseUrl: "",
      proxyAnonKey: "",
    });

    const { AnalyticsClient } = await import("../analytics-client");
    const client = new AnalyticsClient();

    await expect(client.fetchOverview()).rejects.toThrow(/desativado/i);
    expect(fetch).not.toHaveBeenCalled();

    spy.mockRestore();
  });
});

describe("AnalyticsClient — cache", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("saveCache + loadCache round-trips correctly", async () => {
    // We need a valid JWT to derive cache key (sub claim)
    // Create a minimal JWT with sub
    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(JSON.stringify({ sub: "user-abc-123", exp: 9999999999 }));
    const jwt = `${header}.${payload}.fake-sig`;

    syncSessionToLegacyStorage({ access_token: jwt });

    const { AnalyticsClient } = await import("../analytics-client");
    const client = new AnalyticsClient();

    const mockStats = {
      generated_at: "2026-03-07",
      user_id: "user-abc-123",
      range: { from: "2026-02-05", to: "2026-03-07" },
      kpis: { sessions_7d: 5, sessions_30d: 20, attempts_7d: 100, attempts_30d: 400, practice_time_7d_sec: 3600, accuracy_avg: 0.85, latency_avg: 120, best_streak: 10, best_score: 50 },
      daily: [],
      chapters: [],
      global_heatmap: [],
      global_heatmap_top_notes: [],
      error_pairs: [],
      suggestions: [],
      unlocks: [],
    } as any;

    client.saveCache(mockStats);
    const cached = client.loadCache();

    expect(cached).not.toBeNull();
    expect(cached!.stats.user_id).toBe("user-abc-123");
    expect(cached!.stats.kpis.sessions_7d).toBe(5);
  });
});
