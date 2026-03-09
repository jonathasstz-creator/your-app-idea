/**
 * Step Quality System — V2 Engine Tests
 *
 * Tests the StepQuality classification, streak behavior under
 * useStepQualityStreak flag, soft vs hard error tracking.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createEngineV1, createEngineV2 } from '../lesson-engine';
import type { LessonEngineApi } from '../lesson-engine';
import {
  classifyStepQuality,
  computeStreakDelta,
  HARD_ERROR_BREAK_THRESHOLD,
} from '../types/step-quality';

// ============================================================
// Pure function tests
// ============================================================

describe('classifyStepQuality', () => {
  it('PERFECT: no errors', () => {
    expect(classifyStepQuality(0, 0)).toBe('PERFECT');
  });
  it('GREAT: no hard errors, 1 soft error', () => {
    expect(classifyStepQuality(0, 1)).toBe('GREAT');
  });
  it('GOOD: 1 hard error', () => {
    expect(classifyStepQuality(1, 0)).toBe('GOOD');
    expect(classifyStepQuality(1, 3)).toBe('GOOD');
  });
  it('RECOVERED: 2+ hard errors', () => {
    expect(classifyStepQuality(2, 0)).toBe('RECOVERED');
    expect(classifyStepQuality(5, 5)).toBe('RECOVERED');
  });
});

describe('computeStreakDelta', () => {
  it('PERFECT/GREAT: +1', () => {
    expect(computeStreakDelta('PERFECT', 0)).toBe(1);
    expect(computeStreakDelta('GREAT', 3)).toBe(1);
  });
  it('GOOD with high streak: -1 (damage)', () => {
    expect(computeStreakDelta('GOOD', 5)).toBe(-1);
    expect(computeStreakDelta('GOOD', 10)).toBe(-1);
  });
  it('GOOD with low streak: 0 (hold)', () => {
    expect(computeStreakDelta('GOOD', 0)).toBe(0);
    expect(computeStreakDelta('GOOD', 4)).toBe(0);
  });
  it('RECOVERED: resets streak to 0', () => {
    expect(computeStreakDelta('RECOVERED', 7)).toBe(-7);
    expect(computeStreakDelta('RECOVERED', 0)).toBe(0);
  });
});

// ============================================================
// Engine integration tests (with feature flag)
// ============================================================

const makeLesson = (steps: { notes: number[]; start_beat: number }[]) => ({
  session_id: 'test',
  lesson_id: 'test',
  lesson_version: 2,
  total_steps: steps.length,
  steps: steps.map((s, i) => ({ step_index: i, ...s })),
});

describe('V2 Engine — Step Quality with flag ON', () => {
  let engine: LessonEngineApi;

  beforeEach(() => {
    engine = createEngineV2();
    engine.setUseStepQuality(true);
  });

  it('PERFECT step: streak goes up, quality recorded', () => {
    engine.loadLesson(makeLesson([
      { notes: [60, 64], start_beat: 0 },
      { notes: [67], start_beat: 1 },
    ]));

    engine.onMidiInput(60, 100, true);
    engine.onMidiInput(64, 100, true);

    const view = engine.getViewState();
    expect(view.streak).toBe(1);
    expect(view.currentStep).toBe(1);
    expect(engine.getStepQualities()).toEqual(['PERFECT']);
  });

  it('GREAT step: one duplicate (soft error), streak still goes up', () => {
    engine.loadLesson(makeLesson([{ notes: [60, 64], start_beat: 0 }]));

    engine.onMidiInput(60, 100, true);
    engine.onMidiInput(60, 100, true); // duplicate = soft error
    engine.onMidiInput(64, 100, true);

    expect(engine.getViewState().streak).toBe(1);
    expect(engine.getStepQualities()).toEqual(['GREAT']);
  });

  it('GOOD step: 1 wrong note then correct — errors accumulate across retries', () => {
    engine.loadLesson(makeLesson([
      { notes: [60], start_beat: 0 },
      { notes: [62], start_beat: 1 },
    ]));

    // Wrong note → MISS, but with flag ON stepQualityState persists (errors accumulate).
    // hardErrorCount=1 after this.
    engine.onMidiInput(99, 100, true);
    // Correct → completes step. hardErrorCount=1 → GOOD.
    engine.onMidiInput(60, 100, true);

    const view = engine.getViewState();
    expect(view.currentStep).toBe(1);
    expect(engine.getStepQualities()).toEqual(['GOOD']);
  });

  it('single wrong note then correct: GOOD quality, streak holds', () => {
    engine.loadLesson(makeLesson([
      { notes: [60], start_beat: 0 },
      { notes: [62], start_beat: 1 },
      { notes: [64], start_beat: 2 },
    ]));

    // Step 0: perfect, streak=1
    engine.onMidiInput(60, 100, true);
    expect(engine.getViewState().streak).toBe(1);

    // Step 1: wrong note (hardErrorCount=1, persists), then correct → GOOD
    // GOOD with streak < 5 → delta=0, streak holds at 1
    engine.onMidiInput(99, 100, true);
    engine.onMidiInput(62, 100, true);
    expect(engine.getViewState().streak).toBe(1);
    expect(engine.getViewState().currentStep).toBe(2);
    expect(engine.getStepQualities()).toEqual(['PERFECT', 'GOOD']);
  });

  it('GOOD with streak >= 5 causes streak "damage" (-1)', () => {
    engine.loadLesson(makeLesson([
      { notes: [60], start_beat: 0 },
      { notes: [62], start_beat: 1 },
      { notes: [64], start_beat: 2 },
      { notes: [65], start_beat: 3 },
      { notes: [67], start_beat: 4 },
      { notes: [69], start_beat: 5 }, // step 5: will have 1 hard error → GOOD
      { notes: [71], start_beat: 6 },
    ]));

    // Build streak to 5 with perfect steps
    engine.onMidiInput(60, 100, true);
    engine.onMidiInput(62, 100, true);
    engine.onMidiInput(64, 100, true);
    engine.onMidiInput(65, 100, true);
    engine.onMidiInput(67, 100, true);
    expect(engine.getViewState().streak).toBe(5);

    // Step 5: 1 wrong note → GOOD → streak damaged from 5 to 4
    engine.onMidiInput(99, 100, true); // hard error
    engine.onMidiInput(69, 100, true); // complete → GOOD
    expect(engine.getViewState().streak).toBe(4);
    expect(engine.getViewState().bestStreak).toBe(5); // bestStreak preserved
  });

  it('streak broken when many hard errors accumulate in chord step', () => {
    engine.loadLesson(makeLesson([
      { notes: [60], start_beat: 0 },
      { notes: [62, 64], start_beat: 1 },
    ]));

    // Step 0: perfect, streak=1
    engine.onMidiInput(60, 100, true);
    expect(engine.getViewState().streak).toBe(1);

    // Step 1 (chord): wrong notes cause MISS and reset stepState,
    // but with flag ON, stepQualityState persists — hardErrorCount accumulates.
    for (let i = 0; i < HARD_ERROR_BREAK_THRESHOLD; i++) {
      engine.onMidiInput(99, 100, true);
    }

    // After threshold errors, streak should be broken mid-step
    expect(engine.getViewState().streak).toBe(0);
  });

  it('RECOVERED step: many errors before completing — quality reflects accumulated errors', () => {
    engine.loadLesson(makeLesson([
      { notes: [60, 64], start_beat: 0 },
      { notes: [67], start_beat: 1 },
    ]));

    // With flag ON, stepQualityState persists across MISSes on same step.
    // 2 wrong notes → hardErrorCount=2, then complete → RECOVERED (2+ hard errors).
    engine.onMidiInput(99, 100, true); // hard error #1
    engine.onMidiInput(98, 100, true); // hard error #2
    engine.onMidiInput(60, 100, true);
    engine.onMidiInput(64, 100, true); // complete

    expect(engine.getViewState().currentStep).toBe(1);
    expect(engine.getStepQualities()).toEqual(['RECOVERED']);
  });

  it('reset() clears stepQualities but preserves useStepQuality flag', () => {
    engine.loadLesson(makeLesson([
      { notes: [60], start_beat: 0 },
      { notes: [62], start_beat: 1 },
    ]));

    engine.onMidiInput(60, 100, true); // PERFECT
    expect(engine.getStepQualities()).toEqual(['PERFECT']);

    engine.reset();
    expect(engine.getStepQualities()).toEqual([]); // cleared

    // Flag still ON — new step should still be tracked
    engine.loadLesson(makeLesson([{ notes: [64], start_beat: 0 }]));
    engine.onMidiInput(64, 100, true);
    expect(engine.getStepQualities()).toEqual(['PERFECT']);
  });
});

describe('V2 Engine — Legacy streak (flag OFF)', () => {
  let engine: LessonEngineApi;

  beforeEach(() => {
    engine = createEngineV2();
    // flag OFF by default
  });

  it('MISS breaks streak immediately (legacy behavior)', () => {
    engine.loadLesson(makeLesson([
      { notes: [60], start_beat: 0 },
      { notes: [62], start_beat: 1 },
      { notes: [64], start_beat: 2 },
    ]));

    engine.onMidiInput(60, 100, true); // HIT
    expect(engine.getViewState().streak).toBe(1);

    engine.onMidiInput(99, 100, true); // MISS
    expect(engine.getViewState().streak).toBe(0);

    engine.onMidiInput(62, 100, true); // HIT
    expect(engine.getViewState().streak).toBe(1);
  });

  it('duplicate note does NOT affect streak (ignored)', () => {
    engine.loadLesson(makeLesson([{ notes: [60, 64], start_beat: 0 }]));

    engine.onMidiInput(60, 100, true);
    engine.onMidiInput(60, 100, true); // duplicate
    engine.onMidiInput(64, 100, true); // complete

    expect(engine.getViewState().streak).toBe(1);
  });

  it('getStepQualities returns empty (no tracking)', () => {
    engine.loadLesson(makeLesson([{ notes: [60], start_beat: 0 }]));
    engine.onMidiInput(60, 100, true);
    expect(engine.getStepQualities()).toEqual([]);
  });
});

// ============================================================
// V1 Engine — Step Quality stubs (should not crash)
// ============================================================

describe('V1 Engine — Step Quality stubs', () => {
  it('setUseStepQuality and getStepQualities are safe no-ops', () => {
    const engine = createEngineV1();
    // Should not throw
    engine.setUseStepQuality(true);
    expect(engine.getStepQualities()).toEqual([]);

    engine.loadLesson({
      session_id: 'test',
      lesson_id: 'test',
      lesson_version: 1,
      total_steps: 1,
      notes: [{ midi: 60, step_index: 0, start_beat: 0, duration_beats: 1 }],
    });
    engine.onMidiInput(60, 100, true);
    // Still empty — V1 never tracks quality
    expect(engine.getStepQualities()).toEqual([]);
  });
});
