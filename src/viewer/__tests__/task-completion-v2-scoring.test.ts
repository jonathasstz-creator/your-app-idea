/**
 * V2 Scoring Contract Tests
 *
 * Validates the senior-level scoring contract where:
 * - correctSteps comes from engine.getCompletedSteps() (not attempt aggregation)
 * - totalExpectedNotes comes from engine.getTotalExpectedNotes() (not attempts.length)
 * - correctNotes counts unique expected notes satisfied (not raw success count)
 * - V1 path remains unchanged
 * - Legacy fallback (no engineStats) stays functional
 */
import { describe, it, expect, beforeEach } from "vitest";
import { computeTaskResult } from "../services/taskCompletion";
import type { AttemptLog, TaskResultSummaryV2, TaskResultSummaryV1 } from "../types/task";

// Helper to create attempts with required fields
function mkAttempt(
  stepIndex: number,
  midi: number,
  expected: number,
  success: boolean,
  responseMs = 100
): AttemptLog {
  return {
    stepIndex,
    midi,
    noteName: `M${midi}`,
    expected,
    success,
    responseMs,
    timestamp: Date.now(),
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe("computeTaskResult — V2 engine truth path", () => {
  it("Case A: uses engine completedSteps even after miss + retry", () => {
    // Step 0: miss on 60, then retry: hit 60 + hit 64 → engine completes step
    // Step 1: hit 67 + hit 71 → engine completes step
    const attempts: AttemptLog[] = [
      mkAttempt(0, 60, 60, false),  // miss
      mkAttempt(0, 60, 60, true),   // retry success
      mkAttempt(0, 64, 64, true),   // chord complete
      mkAttempt(1, 67, 67, true),
      mkAttempt(1, 71, 71, true),
    ];

    const result = computeTaskResult(
      attempts, 2, "WAIT", "lesson_1", 999, "V2",
      { completedSteps: 2, totalExpectedNotes: 4 }
    ) as TaskResultSummaryV2;

    expect(result.version).toBe("V2");
    expect(result.correctSteps).toBe(2);
    expect(result.totalSteps).toBe(2);
    // stepAccuracy: 2/2 = 100%, not broken by the retry
    expect(result.correctSteps / result.totalSteps).toBe(1.0);
  });

  it("Case B: totalExpectedNotes comes from lesson structure, not attempts.length", () => {
    // 1 step with 2 notes, but 3 attempts (1 miss + 2 hits)
    const attempts: AttemptLog[] = [
      mkAttempt(0, 60, 60, false),  // miss
      mkAttempt(0, 60, 60, true),   // retry
      mkAttempt(0, 64, 64, true),   // chord done
    ];

    const result = computeTaskResult(
      attempts, 1, "WAIT", undefined, undefined, "V2",
      { completedSteps: 1, totalExpectedNotes: 2 }
    ) as TaskResultSummaryV2;

    // Must be 2 (from lesson), not 3 (attempts.length)
    expect(result.totalExpectedNotes).toBe(2);
  });

  it("Case C: correctNotes counts unique expected notes only once on partial step", () => {
    // Step 0 NOT completed: hit 60 twice (duplicate), miss 64
    const attempts: AttemptLog[] = [
      mkAttempt(0, 60, 60, true),
      mkAttempt(0, 60, 60, true),   // duplicate success — must NOT double-count
      mkAttempt(0, 64, 64, false),  // miss
    ];

    const result = computeTaskResult(
      attempts, 1, "WAIT", undefined, undefined, "V2",
      { completedSteps: 0, totalExpectedNotes: 2 }
    ) as TaskResultSummaryV2;

    // Only midi 60 was satisfied; 64 was missed. correctNotes = 1
    expect(result.correctNotes).toBe(1);
    expect(result.correctSteps).toBe(0);
    // noteAccuracy = 1/2 = 0.5
    expect(result.noteAccuracy).toBeCloseTo(0.5);
  });

  it("Case D: completed step contributes all expected notes to correctNotes", () => {
    // Step 0 completed (3-note chord), step 1 partial (1 of 2 hit)
    const attempts: AttemptLog[] = [
      mkAttempt(0, 60, 60, true),
      mkAttempt(0, 64, 64, true),
      mkAttempt(0, 67, 67, true),   // step 0 done
      mkAttempt(1, 72, 72, true),   // partial
      mkAttempt(1, 76, 76, false),  // miss
    ];

    const result = computeTaskResult(
      attempts, 2, "WAIT", undefined, undefined, "V2",
      { completedSteps: 1, totalExpectedNotes: 5 }  // 3 + 2
    ) as TaskResultSummaryV2;

    // Step 0 completed → 3 notes. Step 1 partial → 1 note (72 hit, 76 missed).
    expect(result.correctNotes).toBe(4);  // 3 + 1
    expect(result.correctSteps).toBe(1);
    expect(result.noteAccuracy).toBeCloseTo(0.8);  // 4/5
  });

  it("Case E: V2 fallback without engineStats still works (legacy compat)", () => {
    // Both steps with only successes → old aggregation should count 2
    const attempts: AttemptLog[] = [
      mkAttempt(0, 60, 60, true),
      mkAttempt(0, 64, 64, true),
      mkAttempt(1, 67, 67, true),
    ];

    const result = computeTaskResult(
      attempts, 2, "WAIT", undefined, undefined, "V2"
      // no engineStats
    ) as TaskResultSummaryV2;

    expect(result.version).toBe("V2");
    // Fallback: correctSteps from attempt aggregation
    expect(result.correctSteps).toBe(2);
    // Fallback: totalExpectedNotes = attempts.length (legacy behavior)
    expect(result.totalExpectedNotes).toBe(3);
  });

  it("Case F: V1 has no regression", () => {
    const attempts: AttemptLog[] = [
      mkAttempt(0, 60, 60, true),
      mkAttempt(1, 62, 62, false),
      mkAttempt(2, 64, 64, true),
    ];

    const result = computeTaskResult(
      attempts, 3, "WAIT", undefined, undefined, "V1"
    ) as TaskResultSummaryV1;

    expect(result.version).toBe("V1");
    expect(result.correctSteps).toBe(2);
    expect(result.totalSteps).toBe(3);
    // V1 should not have note-level metrics (perChord is undefined)
    expect(result.perChord).toBeUndefined();
  });

  it("noteAccuracy never exceeds 1.0 with retries and engine truth", () => {
    // 20 steps × 2 notes = 40 expected. Many retries but all completed.
    const attempts: AttemptLog[] = [];
    for (let s = 0; s < 20; s++) {
      // Simulate: miss, then hit both notes
      attempts.push(mkAttempt(s, s * 2 + 60, s * 2 + 60, false));
      attempts.push(mkAttempt(s, s * 2 + 60, s * 2 + 60, true));
      attempts.push(mkAttempt(s, s * 2 + 61, s * 2 + 61, true));
    }

    const result = computeTaskResult(
      attempts, 20, "WAIT", "lesson_scale", 1, "V2",
      { completedSteps: 20, totalExpectedNotes: 40 }
    ) as TaskResultSummaryV2;

    expect(result.correctSteps).toBe(20);
    expect(result.totalExpectedNotes).toBe(40);
    expect(result.correctNotes).toBe(40);
    expect(result.noteAccuracy).toBeLessThanOrEqual(1.0);
    expect(result.noteAccuracy).toBeCloseTo(1.0);
    // stepAccuracy
    expect(result.correctSteps / result.totalSteps).toBe(1.0);
  });

  it("BUG REGRESSION: 100% steps + 100% per-note breakdown → noteAccuracy must be 100%", () => {
    // Reproduces the bug: V2 engine logs expected=chordNotes[0] for ALL notes.
    // With old code, expectedSet per step had only 1 value → correctNotes was halved.
    // 20 steps, each with 2-note chord. All completed. No misses.
    const attempts: AttemptLog[] = [];
    for (let s = 0; s < 20; s++) {
      // Engine logs expected=chordNotes[0] for both notes (the real bug pattern)
      const root = 60 + (s % 3) * 4; // C4, E4, G4 cycling
      const third = root + 4;
      attempts.push(mkAttempt(s, root, root, true));   // expected = chordNotes[0] = root
      attempts.push(mkAttempt(s, third, root, true));   // expected = chordNotes[0] = root (BUG!)
    }

    const result = computeTaskResult(
      attempts, 20, "WAIT", "lesson_chords", 1, "V2",
      { completedSteps: 20, totalExpectedNotes: 40 }
    ) as TaskResultSummaryV2;

    // With the fix, correctNotes uses a.midi (unique per step), not a.expected
    expect(result.correctSteps).toBe(20);
    expect(result.totalExpectedNotes).toBe(40);
    expect(result.correctNotes).toBe(40);  // Was 20 before fix!
    expect(result.noteAccuracy).toBeCloseTo(1.0);  // Was 0.5 before fix!
  });

  it("breakdown per-note and noteAccuracy are mathematically consistent", () => {
    // 3 steps: chord [60,64], chord [60,67], single [60]
    // Step 0 complete, step 1 complete, step 2 complete
    const attempts: AttemptLog[] = [
      mkAttempt(0, 60, 60, true),
      mkAttempt(0, 64, 60, true),  // expected=60 (engine bug), midi=64
      mkAttempt(1, 60, 60, true),
      mkAttempt(1, 67, 60, true),  // expected=60 (engine bug), midi=67
      mkAttempt(2, 60, 60, true),
    ];

    const result = computeTaskResult(
      attempts, 3, "WAIT", undefined, undefined, "V2",
      { completedSteps: 3, totalExpectedNotes: 5 }
    ) as TaskResultSummaryV2;

    expect(result.correctNotes).toBe(5);
    expect(result.noteAccuracy).toBeCloseTo(1.0);
  });
});
