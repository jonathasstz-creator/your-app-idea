/**
 * Beat-to-X Mapping — Monotonicity and Fallback Invariants
 *
 * These test the pure invariants without needing OSMD DOM:
 * - Mapping must be monotonically non-decreasing (notes never "go back")
 * - Fallback logic when match ratio is below threshold
 */
import { describe, it, expect } from "vitest";

interface BeatToXEntry {
  beat: number;
  x: number;
}

/** Pure invariant: mapping must be monotonic (x never decreases as beat increases) */
function isMonotonic(mapping: BeatToXEntry[]): boolean {
  for (let i = 1; i < mapping.length; i++) {
    if (mapping[i].x < mapping[i - 1].x) return false;
  }
  return true;
}

/** Simulates the fallback decision logic from beat-to-x-mapping.ts */
function shouldUseFallback(
  matchedCount: number,
  totalNotes: number,
  minMatchRatio: number,
  minMatchedNotes: number
): boolean {
  if (totalNotes === 0) return true;
  const ratio = matchedCount / totalNotes;
  return ratio < minMatchRatio || matchedCount < minMatchedNotes;
}

/** Simulates linear fallback mapping (constant px/beat) */
function buildLinearFallback(beats: number[], pxPerBeat: number): BeatToXEntry[] {
  return beats.map((beat) => ({ beat, x: beat * pxPerBeat }));
}

describe("Beat-to-X Mapping — Monotonicity", () => {
  it("valid mapping is monotonic", () => {
    const mapping: BeatToXEntry[] = [
      { beat: 0, x: 50 },
      { beat: 1, x: 140 },
      { beat: 2, x: 230 },
      { beat: 3, x: 320 },
    ];
    expect(isMonotonic(mapping)).toBe(true);
  });

  it("detects non-monotonic mapping (x goes backward)", () => {
    const mapping: BeatToXEntry[] = [
      { beat: 0, x: 50 },
      { beat: 1, x: 140 },
      { beat: 2, x: 100 }, // goes back!
      { beat: 3, x: 320 },
    ];
    expect(isMonotonic(mapping)).toBe(false);
  });

  it("single entry is always monotonic", () => {
    expect(isMonotonic([{ beat: 0, x: 50 }])).toBe(true);
  });

  it("empty mapping is monotonic", () => {
    expect(isMonotonic([])).toBe(true);
  });

  it("linear fallback produces monotonic mapping", () => {
    const beats = [0, 0.5, 1, 1.5, 2, 3, 4];
    const mapping = buildLinearFallback(beats, 90);
    expect(isMonotonic(mapping)).toBe(true);
  });
});

describe("Beat-to-X Mapping — Fallback Decision", () => {
  const MIN_MATCH_RATIO = 0.8;
  const MIN_MATCHED_NOTES = 3;

  it("uses fallback when match ratio is too low", () => {
    expect(shouldUseFallback(2, 10, MIN_MATCH_RATIO, MIN_MATCHED_NOTES)).toBe(true);
  });

  it("uses fallback when matched notes below minimum", () => {
    expect(shouldUseFallback(2, 2, MIN_MATCH_RATIO, MIN_MATCHED_NOTES)).toBe(true);
  });

  it("does NOT use fallback when ratio and count are sufficient", () => {
    expect(shouldUseFallback(9, 10, MIN_MATCH_RATIO, MIN_MATCHED_NOTES)).toBe(false);
  });

  it("uses fallback for empty input", () => {
    expect(shouldUseFallback(0, 0, MIN_MATCH_RATIO, MIN_MATCHED_NOTES)).toBe(true);
  });

  it("exact threshold: 80% match passes", () => {
    expect(shouldUseFallback(8, 10, MIN_MATCH_RATIO, MIN_MATCHED_NOTES)).toBe(false);
  });

  it("just below threshold: 79% fails", () => {
    // 7.9/10 → not possible with integers, but 7/10 = 0.7 < 0.8
    expect(shouldUseFallback(7, 10, MIN_MATCH_RATIO, MIN_MATCHED_NOTES)).toBe(true);
  });
});
