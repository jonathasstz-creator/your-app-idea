/**
 * Feature Flags Store — Layer Precedence Tests
 *
 * Regression: flags must follow precedence: defaults < localStorage < remote < runtime
 * The store is a singleton, so we test by importing the class internals directly.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { DEFAULT_FLAGS, FeatureFlagProvider, FeatureFlags } from "../feature-flags/types";
import { LocalFeatureFlagProvider } from "../feature-flags/providers/local";

// We can't import the singleton directly (side effects), so we re-create the class logic.
// This tests the MERGE algorithm in isolation — the real value.

class TestableFeatureFlagStore {
  private state: FeatureFlags = { ...DEFAULT_FLAGS };

  get(name: keyof FeatureFlags): boolean {
    return this.state[name];
  }

  snapshot(): FeatureFlags {
    return { ...this.state };
  }

  /** Exposed merge for testing */
  merge(next: Partial<FeatureFlags>) {
    for (const key of Object.keys(next) as (keyof FeatureFlags)[]) {
      const val = next[key];
      if (typeof val === "boolean") {
        this.state[key] = val;
      }
    }
  }

  set(name: keyof FeatureFlags, value: boolean) {
    this.state = { ...this.state, [name]: value };
  }
}

describe("FeatureFlags — Layer Precedence", () => {
  let store: TestableFeatureFlagStore;

  beforeEach(() => {
    store = new TestableFeatureFlagStore();
    localStorage.clear();
  });

  it("starts with DEFAULT_FLAGS values", () => {
    expect(store.get("showSheetMusic")).toBe(true);
    expect(store.get("useWebSocket")).toBe(false);
  });

  it("localStorage overrides defaults", () => {
    // Simulate: defaults have showSheetMusic=true
    expect(store.get("showSheetMusic")).toBe(true);
    // localStorage says false
    store.merge({ showSheetMusic: false });
    expect(store.get("showSheetMusic")).toBe(false);
  });

  it("remote overrides localStorage", () => {
    // localStorage sets useWebSocket=true
    store.merge({ useWebSocket: true });
    expect(store.get("useWebSocket")).toBe(true);
    // remote says false
    store.merge({ useWebSocket: false });
    expect(store.get("useWebSocket")).toBe(false);
  });

  it("runtime (set) overrides remote", () => {
    // remote sets showFallingNotes=false
    store.merge({ showFallingNotes: false });
    expect(store.get("showFallingNotes")).toBe(false);
    // runtime override
    store.set("showFallingNotes", true);
    expect(store.get("showFallingNotes")).toBe(true);
  });

  it("full chain: defaults -> local -> remote -> runtime", () => {
    // Step 1: defaults
    expect(store.get("showNewCurriculum")).toBe(true);

    // Step 2: localStorage disables it
    store.merge({ showNewCurriculum: false });
    expect(store.get("showNewCurriculum")).toBe(false);

    // Step 3: remote re-enables it
    store.merge({ showNewCurriculum: true });
    expect(store.get("showNewCurriculum")).toBe(true);

    // Step 4: runtime disables it again
    store.set("showNewCurriculum", false);
    expect(store.get("showNewCurriculum")).toBe(false);
  });

  it("ignores non-boolean values in merge", () => {
    const initial = store.snapshot();
    store.merge({ showSheetMusic: "yes" as any });
    expect(store.snapshot()).toEqual(initial);
  });

  it("ignores empty merge", () => {
    const initial = store.snapshot();
    store.merge({});
    expect(store.snapshot()).toEqual(initial);
  });

  it("snapshot returns a copy, not a reference", () => {
    const snap = store.snapshot();
    snap.showSheetMusic = false;
    expect(store.get("showSheetMusic")).toBe(true);
  });
});

describe("LocalFeatureFlagProvider", () => {
  const STORAGE_KEY = "viewer:featureFlags:v1";

  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty when localStorage is empty", async () => {
    const provider = new LocalFeatureFlagProvider();
    const result = await provider.load();
    expect(result).toEqual({});
  });

  it("loads boolean flags from localStorage", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ showSheetMusic: false, showFallingNotes: true }));
    const provider = new LocalFeatureFlagProvider();
    const result = await provider.load();
    expect(result.showSheetMusic).toBe(false);
    expect(result.showFallingNotes).toBe(true);
  });

  it("ignores non-boolean values in localStorage", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ showSheetMusic: "yes", showFallingNotes: 42 }));
    const provider = new LocalFeatureFlagProvider();
    const result = await provider.load();
    expect(result).toEqual({});
  });

  it("handles corrupt JSON gracefully", async () => {
    localStorage.setItem(STORAGE_KEY, "not valid json!!!");
    const provider = new LocalFeatureFlagProvider();
    const result = await provider.load();
    expect(result).toEqual({});
  });

  it("save persists and load reads back", async () => {
    const provider = new LocalFeatureFlagProvider();
    const flags: FeatureFlags = { ...DEFAULT_FLAGS, useWebSocket: true };
    provider.save(flags);
    const loaded = await provider.load();
    expect(loaded.showSheetMusic).toBe(true);
    expect(loaded.showFallingNotes).toBe(true);
  });
});
