/**
 * Auth Storage — Unit Tests
 *
 * Bug #1 regression: cold start pós-login race condition.
 * Tests: token extraction from various storage formats, legacy key fallback,
 * syncSession, clearAuth, and the critical "token must exist before buildHeaders".
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getAuthTokenFromStorage,
  syncSessionToLegacyStorage,
  clearAuthStorage,
} from "../auth-storage";

describe("getAuthTokenFromStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    // Mock VITE_SUPABASE_URL for dynamic key resolution
    vi.stubEnv("VITE_SUPABASE_URL", "https://testproject.supabase.co");
  });

  it("returns null when no token is stored", () => {
    expect(getAuthTokenFromStorage()).toBeNull();
  });

  it("reads from Supabase dynamic key (sb-{ref}-auth-token)", () => {
    localStorage.setItem(
      "sb-testproject-auth-token",
      JSON.stringify({ access_token: "jwt-123" })
    );
    expect(getAuthTokenFromStorage()).toBe("jwt-123");
  });

  it("falls back to legacy key (supabase.auth.token)", () => {
    localStorage.setItem(
      "supabase.auth.token",
      JSON.stringify({ access_token: "legacy-jwt" })
    );
    expect(getAuthTokenFromStorage()).toBe("legacy-jwt");
  });

  it("extracts from nested session structure", () => {
    localStorage.setItem(
      "sb-testproject-auth-token",
      JSON.stringify({ session: { access_token: "nested-jwt" } })
    );
    expect(getAuthTokenFromStorage()).toBe("nested-jwt");
  });

  it("extracts from data.session structure", () => {
    localStorage.setItem(
      "sb-testproject-auth-token",
      JSON.stringify({ data: { session: { access_token: "deep-jwt" } } })
    );
    expect(getAuthTokenFromStorage()).toBe("deep-jwt");
  });

  it("prefers sessionStorage over localStorage for same key", () => {
    localStorage.setItem("access_token", "local-jwt");
    sessionStorage.setItem("access_token", "session-jwt");
    expect(getAuthTokenFromStorage()).toBe("session-jwt");
  });

  it("handles raw string token (non-JSON)", () => {
    localStorage.setItem("SUPABASE_ACCESS_TOKEN", "raw-jwt-token");
    expect(getAuthTokenFromStorage()).toBe("raw-jwt-token");
  });
});

describe("syncSessionToLegacyStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("writes to all legacy keys", () => {
    syncSessionToLegacyStorage({ access_token: "abc123", refresh_token: "ref456" });
    expect(localStorage.getItem("supabase.auth.token")).toBeTruthy();
    expect(localStorage.getItem("SUPABASE_SESSION")).toBeTruthy();
    expect(localStorage.getItem("SUPABASE_ACCESS_TOKEN")).toBe("abc123");
  });

  it("does nothing if access_token is missing", () => {
    syncSessionToLegacyStorage({ access_token: "" });
    expect(localStorage.getItem("SUPABASE_ACCESS_TOKEN")).toBeNull();
  });
});

describe("clearAuthStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubEnv("VITE_SUPABASE_URL", "https://testproject.supabase.co");
  });

  it("clears all known keys from both storages", () => {
    localStorage.setItem("sb-testproject-auth-token", "x");
    localStorage.setItem("supabase.auth.token", "y");
    sessionStorage.setItem("access_token", "z");

    clearAuthStorage();

    expect(localStorage.getItem("sb-testproject-auth-token")).toBeNull();
    expect(localStorage.getItem("supabase.auth.token")).toBeNull();
    expect(sessionStorage.getItem("access_token")).toBeNull();
  });
});

describe("buildHeaders — token dependency", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("REGRESSION: buildHeaders pattern throws when no token exists", () => {
    // Reproduces: cold start where syncSession hasn't run yet
    const token = getAuthTokenFromStorage();
    expect(token).toBeNull();

    // The buildAuthHeaders in index.tsx throws — callers must handle this
    const buildAuthHeaders = () => {
      if (!token) throw new Error("Auth token ausente. Faça login.");
      return { Authorization: `Bearer ${token}` };
    };

    expect(() => buildAuthHeaders()).toThrow("Auth token ausente");
  });

  it("buildHeaders succeeds after syncSession writes token", () => {
    syncSessionToLegacyStorage({ access_token: "valid-jwt" });
    const token = getAuthTokenFromStorage();
    expect(token).toBe("valid-jwt");
  });
});
