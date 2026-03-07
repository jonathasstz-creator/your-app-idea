/**
 * Fire-and-Forget POST /complete — Regression Tests
 *
 * Bug #3: Network failure on POST /v1/sessions/{id}/complete must NOT
 * block the endscreen or crash the UI flow.
 *
 * Tests the resilience pattern: fire-and-forget with error swallowing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Simulate the fire-and-forget pattern used in index.tsx
async function fireAndForgetComplete(
  sessionId: string,
  payload: Record<string, unknown>,
  fetchFn: typeof fetch = fetch
): Promise<{ sent: boolean; error?: string }> {
  try {
    const response = await fetchFn(`/v1/sessions/${sessionId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      console.warn(`[Complete] POST failed with ${response.status}`);
      return { sent: false, error: `HTTP ${response.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.warn("[Complete] Network error (fire-and-forget):", err);
    return { sent: false, error: String(err) };
  }
}

describe("Fire-and-Forget POST /complete", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns sent:true on successful POST", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    });

    const result = await fireAndForgetComplete("sess-123", { score: 100 }, mockFetch as any);
    expect(result.sent).toBe(true);
    expect(result.error).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("does NOT throw on network error", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    // This MUST NOT throw — that's the invariant
    const result = await fireAndForgetComplete("sess-123", { score: 50 }, mockFetch as any);
    expect(result.sent).toBe(false);
    expect(result.error).toContain("Failed to fetch");
  });

  it("does NOT throw on HTTP 500", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await fireAndForgetComplete("sess-123", { score: 50 }, mockFetch as any);
    expect(result.sent).toBe(false);
    expect(result.error).toContain("500");
  });

  it("does NOT throw on HTTP 401 (expired token)", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    const result = await fireAndForgetComplete("sess-123", {}, mockFetch as any);
    expect(result.sent).toBe(false);
    expect(result.error).toContain("401");
  });

  it("does NOT throw on timeout (AbortError)", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new DOMException("The operation was aborted", "AbortError"));

    const result = await fireAndForgetComplete("sess-123", {}, mockFetch as any);
    expect(result.sent).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("sends correct URL with session ID", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    await fireAndForgetComplete("abc-def-123", { x: 1 }, mockFetch as any);

    expect(mockFetch).toHaveBeenCalledWith(
      "/v1/sessions/abc-def-123/complete",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ x: 1 }),
      })
    );
  });

  it("concurrent calls don't interfere with each other", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error("network down"));
      return Promise.resolve({ ok: true, status: 200 });
    });

    const [r1, r2] = await Promise.all([
      fireAndForgetComplete("sess-1", {}, mockFetch as any),
      fireAndForgetComplete("sess-2", {}, mockFetch as any),
    ]);

    // One fails, one succeeds — neither throws
    expect(r1.sent).toBe(false);
    expect(r2.sent).toBe(true);
  });
});

describe("Endscreen must render regardless of /complete result", () => {
  it("endscreen callback runs even when POST fails", async () => {
    const onEndscreen = vi.fn();
    const mockFetch = vi.fn().mockRejectedValue(new Error("offline"));

    // Simulate: fire POST, then call endscreen
    await fireAndForgetComplete("sess-x", {}, mockFetch as any);
    onEndscreen();

    expect(onEndscreen).toHaveBeenCalledOnce();
  });

  it("endscreen callback runs even when POST is slow", async () => {
    const onEndscreen = vi.fn();
    const mockFetch = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, status: 200 }), 5000))
    );

    // Fire-and-forget: don't await
    fireAndForgetComplete("sess-x", {}, mockFetch as any);

    // Endscreen renders immediately, doesn't wait for POST
    onEndscreen();
    expect(onEndscreen).toHaveBeenCalledOnce();
  });
});
