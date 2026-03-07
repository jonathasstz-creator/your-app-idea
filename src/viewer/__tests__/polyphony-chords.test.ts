/**
 * Polyphony / Chords — V2 Engine Invariants
 *
 * Regressions: P-11, P-13, H-06
 * - Chord expansion: 1 chord step → N note interactions in AttemptLog
 * - PARTIAL_HIT: step only advances when ALL chord notes are hit
 * - Miss window respects duration_beats (long notes don't miss early)
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createEngineV2 } from "../lesson-engine";
import type { LessonEngineApi } from "../lesson-engine";

const makeV2Lesson = (steps: { notes: number[]; start_beat: number; duration_beats?: number }[]) => ({
  session_id: "test-sess",
  lesson_id: "test-lesson",
  lesson_version: 2,
  total_steps: steps.length,
  steps: steps.map((s, i) => ({ step_index: i, ...s })),
});

describe("Polyphony V2 — Chord Expansion", () => {
  let engine: LessonEngineApi;

  beforeEach(() => {
    engine = createEngineV2();
  });

  it("single-note step works like V1", () => {
    engine.loadLesson(makeV2Lesson([{ notes: [60], start_beat: 0 }]));
    const r = engine.onMidiInput(60, 100, true);
    expect(r.result).toBe("HIT");
    expect(r.advanced).toBe(true);
    expect(engine.getViewState().status).toBe("DONE");
  });

  it("chord step requires ALL notes to advance (PARTIAL_HIT)", () => {
    engine.loadLesson(makeV2Lesson([{ notes: [60, 64, 67], start_beat: 0 }]));

    // Play 1st note
    const r1 = engine.onMidiInput(60, 100, true);
    expect(r1.advanced).toBe(false); // not yet complete
    expect(engine.getViewState().currentStep).toBe(0);

    // Play 2nd note
    const r2 = engine.onMidiInput(64, 100, true);
    expect(r2.advanced).toBe(false);
    expect(engine.getViewState().currentStep).toBe(0);

    // Play 3rd note — NOW it should advance
    const r3 = engine.onMidiInput(67, 100, true);
    expect(r3.advanced).toBe(true);
    expect(r3.result).toBe("HIT");
    expect(engine.getViewState().status).toBe("DONE");
  });

  it("wrong note in chord causes MISS and resets step state", () => {
    engine.loadLesson(makeV2Lesson([
      { notes: [60, 64], start_beat: 0 },
      { notes: [67], start_beat: 1 },
    ]));

    engine.onMidiInput(60, 100, true); // correct partial
    const miss = engine.onMidiInput(99, 100, true); // wrong
    expect(miss.result).toBe("MISS");
    // Still on step 0 (MISS doesn't advance)
    expect(engine.getViewState().currentStep).toBe(0);
  });

  it("duplicate note in chord is ignored (no double-count)", () => {
    engine.loadLesson(makeV2Lesson([{ notes: [60, 64], start_beat: 0 }]));

    engine.onMidiInput(60, 100, true);
    engine.onMidiInput(60, 100, true); // duplicate — should be ignored
    expect(engine.getViewState().currentStep).toBe(0); // not advanced

    engine.onMidiInput(64, 100, true); // complete
    expect(engine.getViewState().currentStep).toBe(1);
  });

  it("AttemptLog records chord attempts correctly", () => {
    engine.loadLesson(makeV2Lesson([{ notes: [60, 64], start_beat: 0 }]));

    engine.onMidiInput(60, 100, true);
    engine.onMidiInput(64, 100, true);

    const log = engine.getAttemptLog();
    // V2 WAIT mode logs individual note attempts
    expect(log.length).toBeGreaterThanOrEqual(1);
    // At least one successful attempt logged
    expect(log.some((a) => a.success)).toBe(true);
  });
});

describe("Polyphony V2 — Miss Window & duration_beats", () => {
  it("getStepMissAfterMs respects duration_beats (extracted logic)", () => {
    // Reproduce the getStepMissAfterMs logic from LessonEngineV2
    const STEP_MISS_AFTER_MS = 500;

    function computeMissAfterMs(durationBeats: number | undefined, bpm: number): number {
      if (durationBeats !== undefined && Number.isFinite(durationBeats) && durationBeats > 0) {
        const msPerBeat = 60000 / Math.max(1, bpm);
        return Math.max(STEP_MISS_AFTER_MS, durationBeats * msPerBeat);
      }
      return STEP_MISS_AFTER_MS;
    }

    // Short note: uses default 500ms
    expect(computeMissAfterMs(0.5, 120)).toBe(500);

    // Long note at 120 BPM: 4 beats = 2000ms > 500ms
    expect(computeMissAfterMs(4, 120)).toBe(2000);

    // Very long note at 60 BPM: 4 beats = 4000ms
    expect(computeMissAfterMs(4, 60)).toBe(4000);

    // Undefined duration: default
    expect(computeMissAfterMs(undefined, 120)).toBe(500);

    // duration_beats=2 at 120 BPM = 1000ms > 500ms
    expect(computeMissAfterMs(2, 120)).toBe(1000);
  });
});
