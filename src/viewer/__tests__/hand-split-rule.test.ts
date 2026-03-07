/**
 * Hand Split Rule — Invariant Tests
 *
 * Regression bug #2: C4 (MIDI 60) was duplicated in both hands.
 * Rule: Left hand = pitch < 60, Right hand = pitch >= 60.
 * C4 (60) MUST be right hand only.
 */
import { describe, it, expect } from "vitest";

// Extract the pure rule so it's testable without UI dependencies
const SPLIT_POINT = 60; // C4

function classifyHand(pitch: number): "left" | "right" {
  return pitch < SPLIT_POINT ? "left" : "right";
}

function splitNotesByHand(pitches: number[]): { left: number[]; right: number[] } {
  const left: number[] = [];
  const right: number[] = [];
  for (const p of pitches) {
    if (p < SPLIT_POINT) {
      left.push(p);
    } else {
      right.push(p);
    }
  }
  return { left, right };
}

describe("Hand Split Rule", () => {
  it("C4 (MIDI 60) is classified as RIGHT hand", () => {
    expect(classifyHand(60)).toBe("right");
  });

  it("B3 (MIDI 59) is classified as LEFT hand", () => {
    expect(classifyHand(59)).toBe("left");
  });

  it("C#4 (MIDI 61) is classified as RIGHT hand", () => {
    expect(classifyHand(61)).toBe("right");
  });

  it("A0 (MIDI 21, lowest piano key) is LEFT", () => {
    expect(classifyHand(21)).toBe("left");
  });

  it("C8 (MIDI 108, highest piano key) is RIGHT", () => {
    expect(classifyHand(108)).toBe("right");
  });

  it("C4 never appears in both hands (no duplication)", () => {
    const pitches = [48, 55, 59, 60, 64, 67, 72];
    const { left, right } = splitNotesByHand(pitches);

    // C4 (60) must be in right only
    expect(right).toContain(60);
    expect(left).not.toContain(60);

    // No pitch appears in both
    const overlap = left.filter((p) => right.includes(p));
    expect(overlap).toHaveLength(0);
  });

  it("splits a typical C major chord correctly", () => {
    // Left: C3(48), E3(52), G3(55)
    // Right: C4(60), E4(64), G4(67)
    const pitches = [48, 52, 55, 60, 64, 67];
    const { left, right } = splitNotesByHand(pitches);
    expect(left).toEqual([48, 52, 55]);
    expect(right).toEqual([60, 64, 67]);
  });

  it("handles single-hand scenarios (all left)", () => {
    const { left, right } = splitNotesByHand([36, 40, 43]);
    expect(left).toEqual([36, 40, 43]);
    expect(right).toEqual([]);
  });

  it("handles single-hand scenarios (all right)", () => {
    const { left, right } = splitNotesByHand([60, 72, 84]);
    expect(left).toEqual([]);
    expect(right).toEqual([60, 72, 84]);
  });

  it("handles empty input", () => {
    const { left, right } = splitNotesByHand([]);
    expect(left).toEqual([]);
    expect(right).toEqual([]);
  });

  it("boundary: exactly at split point (60) goes right, 59 goes left", () => {
    const { left, right } = splitNotesByHand([59, 60]);
    expect(left).toEqual([59]);
    expect(right).toEqual([60]);
  });
});
