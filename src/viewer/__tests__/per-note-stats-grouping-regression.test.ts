/**
 * PER-NOTE STATS GROUPING — ANTI-REGRESSION
 *
 * Bug: computePerNoteStatsV1 grouped by attempt.midi (played note)
 * instead of attempt.expected (expected note).
 * 
 * Consequence:
 * - Wrong notes (e.g., F4 when E4 was expected) appear as separate entries
 * - Expected notes with 100% success but with misattributed errors disappear
 * - User sees notes they never needed to practice (e.g., F4) in "notes to improve"
 *
 * Fix: Group by attempt.expected so failures are attributed to the correct exercise note.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { computeTaskResult } from "../services/taskCompletion";
import { AttemptLog } from "../types/task";

// Mock localStorage
const store: Record<string, string> = {};
beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => Object.keys(store).forEach((k) => delete store[k]),
    length: 0,
    key: () => null,
  });
});

function makeAttempt(
  stepIndex: number,
  midi: number,
  expected: number,
  success: boolean,
  responseMs = 500
): AttemptLog {
  return {
    stepIndex,
    midi,
    noteName: `note_${midi}`,
    expected,
    success,
    responseMs,
    timestamp: Date.now() + stepIndex * 1000,
  };
}

describe("perNote stats grouping by expected note", () => {
  it("should attribute miss to expected note, not played note", () => {
    // Exercise: E4 (64) and G4 (67), alternating
    // User misses E4 once by playing F4 (65), then retries successfully
    const attempts: AttemptLog[] = [
      makeAttempt(0, 65, 64, false),  // Expected E4, played F4 = MISS
      makeAttempt(0, 64, 64, true),   // Retry: played E4 = HIT
      makeAttempt(1, 67, 67, true),   // Expected G4, played G4 = HIT
      makeAttempt(2, 64, 64, true),   // Expected E4, played E4 = HIT
      makeAttempt(3, 67, 67, true),   // Expected G4, played G4 = HIT
    ];

    const result = computeTaskResult(attempts, 4, "WAIT", "lesson1", 1, "V1");
    const perNote = result.perNote!;

    // E4 should appear: 2 correct out of 3 total (the miss + 2 hits)
    const e4 = perNote.find((n) => n.midi === 64);
    expect(e4).toBeDefined();
    expect(e4!.correct).toBe(2);
    expect(e4!.total).toBe(3);

    // G4 should appear: 2 correct out of 2 total
    const g4 = perNote.find((n) => n.midi === 67);
    expect(g4).toBeDefined();
    expect(g4!.correct).toBe(2);
    expect(g4!.total).toBe(2);

    // F4 should NOT appear — it's not an exercise note
    const f4 = perNote.find((n) => n.midi === 65);
    expect(f4).toBeUndefined();
  });

  it("should show expected note even when all attempts are successful", () => {
    const attempts: AttemptLog[] = [
      makeAttempt(0, 64, 64, true),
      makeAttempt(1, 67, 67, true),
      makeAttempt(2, 64, 64, true),
      makeAttempt(3, 67, 67, true),
    ];

    const result = computeTaskResult(attempts, 4, "WAIT", "lesson1", 1, "V1");
    const perNote = result.perNote!;

    const e4 = perNote.find((n) => n.midi === 64);
    const g4 = perNote.find((n) => n.midi === 67);
    expect(e4).toBeDefined();
    expect(g4).toBeDefined();
    expect(e4!.pct).toBe(100);
    expect(g4!.pct).toBe(100);
  });

  it("should not create phantom entries for wrong notes played", () => {
    // User plays C4 (60) instead of E4 (64) — a common adjacent key mistake
    const attempts: AttemptLog[] = [
      makeAttempt(0, 60, 64, false),  // Expected E4, played C4 = MISS
      makeAttempt(0, 64, 64, true),   // Retry: played E4 = HIT
    ];

    const result = computeTaskResult(attempts, 1, "WAIT", "lesson1", 1, "V1");
    const perNote = result.perNote!;

    // Only E4 should appear (the expected note)
    expect(perNote).toHaveLength(1);
    expect(perNote[0].midi).toBe(64);
    expect(perNote[0].correct).toBe(1);
    expect(perNote[0].total).toBe(2);

    // C4 should NOT appear
    const c4 = perNote.find((n) => n.midi === 60);
    expect(c4).toBeUndefined();
  });

  it("V2 perNote should also group by expected", () => {
    const attempts: AttemptLog[] = [
      makeAttempt(0, 65, 64, false),  // Expected E4, played F4
      makeAttempt(0, 64, 64, true),   // Retry E4
      makeAttempt(1, 67, 67, true),
    ];

    const result = computeTaskResult(attempts, 2, "WAIT", "lesson1", 1, "V2", {
      completedSteps: 2,
      totalExpectedNotes: 2,
    });
    const perNote = result.perNote!;

    const f4 = perNote.find((n) => n.midi === 65);
    expect(f4).toBeUndefined();

    const e4 = perNote.find((n) => n.midi === 64);
    expect(e4).toBeDefined();
  });
});
