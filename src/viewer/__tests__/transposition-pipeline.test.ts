/**
 * Transposition Pipeline — LessonTransposer Invariants
 *
 * H-11: Transposition must be consistent between OSMD display and engine logic.
 * Tests the pure LessonTransposer without OSMD DOM.
 */
import { describe, it, expect } from "vitest";
import { LessonTransposer } from "../services/lesson-transposer";
import type { LessonContentPacket } from "../types";

const makeLesson = (notes: number[], steps?: { notes: number[]; start_beat: number }[]): LessonContentPacket => ({
  session_id: "test",
  lesson_id: "les-1",
  lesson_version: 1,
  bpm: 120,
  beats_per_measure: 4,
  count_in_beats: 0,
  total_steps: notes.length || (steps?.length ?? 0),
  notes: notes.map((midi, i) => ({
    step_index: i,
    midi,
    start_beat: i,
    duration_beats: 1,
  })),
  steps: steps,
} as any);

describe("LessonTransposer.clampMidi", () => {
  it("transposes within range without clamping", () => {
    const { midi, clamped } = LessonTransposer.clampMidi(60, 5);
    expect(midi).toBe(65);
    expect(clamped).toBe(false);
  });

  it("clamps when transposed above 108 (shifts down by octave)", () => {
    const { midi, clamped } = LessonTransposer.clampMidi(105, 10);
    // 105 + 10 = 115 → 115 - 12 = 103
    expect(midi).toBe(103);
    expect(clamped).toBe(true);
  });

  it("clamps when transposed below 21 (shifts up by octave)", () => {
    const { midi, clamped } = LessonTransposer.clampMidi(25, -10);
    // 25 - 10 = 15 → 15 + 12 = 27
    expect(midi).toBe(27);
    expect(clamped).toBe(true);
  });

  it("handles extreme: lowest piano key", () => {
    const { midi } = LessonTransposer.clampMidi(21, 0);
    expect(midi).toBe(21);
  });

  it("handles extreme: highest piano key", () => {
    const { midi } = LessonTransposer.clampMidi(108, 0);
    expect(midi).toBe(108);
  });
});

describe("LessonTransposer.transpose", () => {
  it("0 semitones returns same reference (no clone cost)", () => {
    const lesson = makeLesson([60, 64, 67]);
    const { lesson: result, warnings } = LessonTransposer.transpose(lesson, { semitones: 0 });
    expect(result).toBe(lesson); // reference equality
    expect(warnings).toHaveLength(0);
  });

  it("transposes V1 notes by +2 semitones", () => {
    const lesson = makeLesson([60, 64, 67]);
    const { lesson: result } = LessonTransposer.transpose(lesson, { semitones: 2 });
    expect(result.notes![0].midi).toBe(62);
    expect(result.notes![1].midi).toBe(66);
    expect(result.notes![2].midi).toBe(69);
  });

  it("transposes V2 steps (chords) by -3 semitones", () => {
    const lesson = makeLesson([], [
      { notes: [60, 64, 67], start_beat: 0 },
      { notes: [62, 65, 69], start_beat: 1 },
    ]);
    const { lesson: result } = LessonTransposer.transpose(lesson, { semitones: -3 });
    expect(result.steps![0].notes).toEqual([57, 61, 64]);
    expect(result.steps![1].notes).toEqual([59, 62, 66]);
  });

  it("produces immutable clone (original not mutated)", () => {
    const lesson = makeLesson([60]);
    const { lesson: result } = LessonTransposer.transpose(lesson, { semitones: 5 });
    expect(result.notes![0].midi).toBe(65);
    expect(lesson.notes![0].midi).toBe(60); // original unchanged
  });

  it("emits MIDI_OVERFLOW warning when clamping occurs", () => {
    const lesson = makeLesson([105, 106, 107]);
    const { warnings } = LessonTransposer.transpose(lesson, { semitones: 10 });
    expect(warnings.some((w) => w.type === "MIDI_OVERFLOW")).toBe(true);
  });

  it("no overflow warning when all notes fit", () => {
    const lesson = makeLesson([60, 64, 67]);
    const { warnings } = LessonTransposer.transpose(lesson, { semitones: 2 });
    expect(warnings).toHaveLength(0);
  });
});
