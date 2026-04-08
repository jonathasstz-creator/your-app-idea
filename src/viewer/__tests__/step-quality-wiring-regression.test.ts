/**
 * Step Quality Wiring — Anti-Regression Tests
 *
 * Simulates the wiring layer between engine, flags, guards, and UI controllers.
 * Catches the exact bugs from 2026-03-12:
 * - controllers created conditionally (null when flags false at boot)
 * - frozen featureFlagSnapshot
 * - flag combos not guarded properly
 *
 * Does NOT import index.tsx (untestable god file).
 * Instead, recreates the wiring contract as a thin integration test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createEngineV1, createEngineV2, LessonEngineApi } from '../lesson-engine';
import {
  StepQualityBadgeController,
  NoteFeedbackController,
  ChordClosureEffect,
} from '../step-quality-ui';
import { FeatureFlags, DEFAULT_FLAGS } from '../feature-flags/types';

// ============================================================
// Wiring simulation: mirrors index.tsx contract
// ============================================================

interface WiringContext {
  engine: LessonEngineApi;
  badge: StepQualityBadgeController;
  feedback: NoteFeedbackController;
  chordFx: ChordClosureEffect;
  flagSnapshot: FeatureFlags;
  schemaVersion: 1 | 2;
  mode: 'WAIT' | 'FILM';
}

/**
 * Simulates what the MIDI handler in index.tsx does:
 * checks guards, calls engine, calls controllers.
 */
function simulateMidiInput(ctx: WiringContext, midi: number) {
  const { engine, badge, feedback, chordFx, flagSnapshot, schemaVersion, mode } = ctx;

  const viewBefore = engine.getViewState();
  const result = engine.onMidiInput(midi, 100, true);
  const viewAfter = engine.getViewState();

  // Guard: Step Quality feedback block (mirrors index.tsx post-fix)
  if (mode === 'WAIT' && flagSnapshot.showStepQualityFeedback) {
    const stepAdvanced = viewAfter.currentStep > viewBefore.currentStep;

    if (schemaVersion === 2) {
      // V2: Full step quality with chords, quality badge, partial hits
      if (result.result === 'MISS') {
        feedback.showWrongNote();
      }

      if (stepAdvanced) {
        // Quality badge (only when step quality tracking is active)
        if (flagSnapshot.useStepQualityStreak) {
          const qualities = engine.getStepQualities();
          const lastQuality = qualities[qualities.length - 1];
          if (lastQuality) {
            badge.show(lastQuality);
          }
        }
        chordFx.trigger();
        feedback.showChordComplete();
      }
    } else {
      // V1: Basic note feedback (HIT → ✓, MISS → ✗)
      if (stepAdvanced || result.result === 'HIT') {
        feedback.showChordComplete();
      } else if (result.result === 'MISS') {
        feedback.showWrongNote();
      }
    }
  }

  return result;
}

// ============================================================
// Test helpers
// ============================================================

const makeV2Lesson = (steps: { notes: number[]; start_beat: number }[]) => ({
  session_id: 'test',
  lesson_id: 'test',
  lesson_version: 2,
  total_steps: steps.length,
  steps: steps.map((s, i) => ({ step_index: i, ...s })),
});

const makeV1Lesson = () => ({
  session_id: 'test',
  lesson_id: 'test',
  lesson_version: 1,
  total_steps: 2,
  notes: [
    { midi: 60, step_index: 0, start_beat: 0, duration_beats: 1 },
    { midi: 62, step_index: 1, start_beat: 1, duration_beats: 1 },
  ],
});

// ============================================================
// Anti-regression: Controller lifecycle
// ============================================================

describe('Anti-regression: Controllers always created', () => {
  it('controllers are safe to create with flags false — the old bug', () => {
    // OLD BUG: if (flag) { badge = new Controller() } → null when flag false
    // NEW: always create, let guards handle execution
    const badge = new StepQualityBadgeController(null);
    const feedback = new NoteFeedbackController(null);
    const chordFx = new ChordClosureEffect(null);

    // All operations safe
    expect(() => badge.show('PERFECT')).not.toThrow();
    expect(() => feedback.showWrongNote()).not.toThrow();
    expect(() => chordFx.trigger()).not.toThrow();

    badge.destroy();
    feedback.destroy();
    chordFx.destroy();
  });

  it('controllers work with real DOM elements', () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    el.hidden = true;
    const badge = new StepQualityBadgeController(el);

    badge.show('PERFECT');
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe('Perfeito');

    badge.clear();
    expect(el.hidden).toBe(true);

    badge.destroy();
    vi.useRealTimers();
  });

  it('destroy + subsequent calls do not throw', () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    const feedback = new NoteFeedbackController(el);
    feedback.showWrongNote();
    feedback.destroy();

    // Post-destroy calls are safe
    expect(() => feedback.showPartialHit(1, 3)).not.toThrow();
    expect(() => feedback.showChordComplete()).not.toThrow();
    expect(() => feedback.showWrongNote()).not.toThrow();
    expect(() => feedback.clear()).not.toThrow();
    vi.useRealTimers();
  });
});

// ============================================================
// Anti-regression: Guard matrix (V1/V2 × WAIT/FILM × flag combos)
// ============================================================

describe('Anti-regression: Guard matrix', () => {
  let badgeEl: HTMLDivElement;
  let feedbackEl: HTMLDivElement;
  let stepEl: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    badgeEl = document.createElement('div');
    badgeEl.hidden = true;
    feedbackEl = document.createElement('div');
    stepEl = document.createElement('div');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeCtx(overrides: Partial<WiringContext>): WiringContext {
    const engine = overrides.engine ?? createEngineV2();
    return {
      engine,
      badge: new StepQualityBadgeController(badgeEl),
      feedback: new NoteFeedbackController(feedbackEl),
      chordFx: new ChordClosureEffect(stepEl),
      flagSnapshot: { ...DEFAULT_FLAGS },
      schemaVersion: 2,
      mode: 'WAIT',
      ...overrides,
    };
  }

  it('V2 + WAIT + both flags ON → feedback appears', () => {
    const ctx = makeCtx({
      flagSnapshot: {
        ...DEFAULT_FLAGS,
        showStepQualityFeedback: true,
        useStepQualityStreak: true,
      },
    });
    ctx.engine.setUseStepQuality(true);
    ctx.engine.loadLesson(makeV2Lesson([
      { notes: [60], start_beat: 0 },
      { notes: [62], start_beat: 1 },
    ]));

    simulateMidiInput(ctx, 60);
    expect(badgeEl.hidden).toBe(false); // badge appeared
    expect(badgeEl.textContent).toBe('Perfeito');
  });

  it('V1 + both flags ON → no feedback (guard blocks)', () => {
    const v1Engine = createEngineV1();
    const ctx = makeCtx({
      engine: v1Engine,
      schemaVersion: 1,
      flagSnapshot: {
        ...DEFAULT_FLAGS,
        showStepQualityFeedback: true,
        useStepQualityStreak: true,
      },
    });
    v1Engine.loadLesson(makeV1Lesson());
    simulateMidiInput(ctx, 60);

    expect(badgeEl.hidden).toBe(true); // no badge
  });

  it('V2 + FILM + both flags ON → no feedback (guard blocks)', () => {
    const ctx = makeCtx({
      mode: 'FILM',
      flagSnapshot: {
        ...DEFAULT_FLAGS,
        showStepQualityFeedback: true,
        useStepQualityStreak: true,
      },
    });
    ctx.engine.loadLesson(makeV2Lesson([{ notes: [60], start_beat: 0 }]));
    simulateMidiInput(ctx, 60);

    expect(badgeEl.hidden).toBe(true);
  });

  it('V2 + WAIT + showStepQualityFeedback ON + useStepQualityStreak OFF → no feedback', () => {
    const ctx = makeCtx({
      flagSnapshot: {
        ...DEFAULT_FLAGS,
        showStepQualityFeedback: true,
        useStepQualityStreak: false,
      },
    });
    ctx.engine.loadLesson(makeV2Lesson([{ notes: [60], start_beat: 0 }]));
    simulateMidiInput(ctx, 60);

    expect(badgeEl.hidden).toBe(true);
  });

  it('V2 + WAIT + showStepQualityFeedback OFF + useStepQualityStreak ON → no feedback', () => {
    const ctx = makeCtx({
      flagSnapshot: {
        ...DEFAULT_FLAGS,
        showStepQualityFeedback: false,
        useStepQualityStreak: true,
      },
    });
    ctx.engine.setUseStepQuality(true);
    ctx.engine.loadLesson(makeV2Lesson([{ notes: [60], start_beat: 0 }]));
    simulateMidiInput(ctx, 60);

    expect(badgeEl.hidden).toBe(true);
  });

  it('both flags OFF (default) → legacy behavior, no feedback', () => {
    const ctx = makeCtx({});
    ctx.engine.loadLesson(makeV2Lesson([{ notes: [60], start_beat: 0 }]));
    simulateMidiInput(ctx, 60);

    expect(badgeEl.hidden).toBe(true);
  });
});

// ============================================================
// Anti-regression: Runtime flag toggle (the frozen snapshot bug)
// ============================================================

describe('Anti-regression: Runtime flag toggle', () => {
  const syncEngineStepQuality = (
    engine: LessonEngineApi,
    flagSnapshot: FeatureFlags,
    schemaVersion: 1 | 2
  ) => {
    if (schemaVersion !== 2) return;
    engine.setUseStepQuality(!!flagSnapshot.useStepQualityStreak);
  };

  it('enabling flags after boot makes feedback work', () => {
    vi.useFakeTimers();
    const badgeEl = document.createElement('div');
    badgeEl.hidden = true;
    const feedbackEl = document.createElement('div');
    const stepEl = document.createElement('div');

    const engine = createEngineV2();

    const ctx: WiringContext = {
      engine,
      badge: new StepQualityBadgeController(badgeEl),
      feedback: new NoteFeedbackController(feedbackEl),
      chordFx: new ChordClosureEffect(stepEl),
      flagSnapshot: { ...DEFAULT_FLAGS },
      schemaVersion: 2,
      mode: 'WAIT',
    };

    engine.loadLesson(makeV2Lesson([
      { notes: [60], start_beat: 0 },
      { notes: [62], start_beat: 1 },
      { notes: [64], start_beat: 2 },
    ]));

    simulateMidiInput(ctx, 60);
    expect(badgeEl.hidden).toBe(true);

    ctx.flagSnapshot = {
      ...DEFAULT_FLAGS,
      showStepQualityFeedback: true,
      useStepQualityStreak: true,
    };
    syncEngineStepQuality(ctx.engine, ctx.flagSnapshot, ctx.schemaVersion);

    simulateMidiInput(ctx, 62);
    expect(badgeEl.hidden).toBe(false);
    expect(badgeEl.textContent).toBe('Perfeito');

    vi.useRealTimers();
  });

  it('turning on only Quality Streak at runtime updates the live engine for subsequent steps', () => {
    vi.useFakeTimers();
    const badgeEl = document.createElement('div');
    badgeEl.hidden = true;
    const feedbackEl = document.createElement('div');
    const stepEl = document.createElement('div');
    const engine = createEngineV2();

    const ctx: WiringContext = {
      engine,
      badge: new StepQualityBadgeController(badgeEl),
      feedback: new NoteFeedbackController(feedbackEl),
      chordFx: new ChordClosureEffect(stepEl),
      flagSnapshot: {
        ...DEFAULT_FLAGS,
        showStepQualityFeedback: true,
        useStepQualityStreak: false,
      },
      schemaVersion: 2,
      mode: 'WAIT',
    };

    engine.loadLesson(makeV2Lesson([
      { notes: [60], start_beat: 0 },
      { notes: [62], start_beat: 1 },
    ]));

    simulateMidiInput(ctx, 60);
    expect(badgeEl.hidden).toBe(true);
    expect(engine.getStepQualities()).toEqual([]);

    ctx.flagSnapshot = {
      ...ctx.flagSnapshot,
      useStepQualityStreak: true,
    };
    syncEngineStepQuality(ctx.engine, ctx.flagSnapshot, ctx.schemaVersion);

    simulateMidiInput(ctx, 62);
    expect(engine.getStepQualities()).toEqual(['PERFECT']);
    expect(badgeEl.hidden).toBe(false);
    expect(badgeEl.textContent).toBe('Perfeito');

    vi.useRealTimers();
  });
});

// ============================================================
// Anti-regression: Feedback flow (partial, wrong, chord, badge)
// ============================================================

describe('Anti-regression: Feedback flow in V2 WAIT', () => {
  let ctx: WiringContext;
  let badgeEl: HTMLDivElement;
  let feedbackEl: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    badgeEl = document.createElement('div');
    badgeEl.hidden = true;
    feedbackEl = document.createElement('div');
    const stepEl = document.createElement('div');
    const engine = createEngineV2();
    engine.setUseStepQuality(true);

    ctx = {
      engine,
      badge: new StepQualityBadgeController(badgeEl),
      feedback: new NoteFeedbackController(feedbackEl),
      chordFx: new ChordClosureEffect(stepEl),
      flagSnapshot: {
        ...DEFAULT_FLAGS,
        showStepQualityFeedback: true,
        useStepQualityStreak: true,
      },
      schemaVersion: 2,
      mode: 'WAIT',
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('wrong note shows error feedback', () => {
    ctx.engine.loadLesson(makeV2Lesson([
      { notes: [60], start_beat: 0 },
      { notes: [62], start_beat: 1 },
    ]));

    simulateMidiInput(ctx, 99); // wrong
    expect(feedbackEl.textContent).toBe('✗');
    expect(feedbackEl.classList.contains('is-wrong-brief')).toBe(true);
  });

  it('chord completion shows badge + checkmark', () => {
    ctx.engine.loadLesson(makeV2Lesson([
      { notes: [60, 64], start_beat: 0 },
      { notes: [67], start_beat: 1 },
    ]));

    simulateMidiInput(ctx, 60);
    // Partial — no badge yet
    expect(badgeEl.hidden).toBe(true);

    simulateMidiInput(ctx, 64);
    // Chord complete — badge + checkmark
    expect(badgeEl.hidden).toBe(false);
    expect(badgeEl.textContent).toBe('Perfeito');
    expect(feedbackEl.textContent).toBe('✓');
  });

  it('wrong note then correct → GOOD quality badge', () => {
    ctx.engine.loadLesson(makeV2Lesson([
      { notes: [60], start_beat: 0 },
      { notes: [62], start_beat: 1 },
    ]));

    simulateMidiInput(ctx, 99); // wrong → MISS
    simulateMidiInput(ctx, 60); // correct → completes step

    expect(badgeEl.hidden).toBe(false);
    expect(badgeEl.textContent).toBe('Boa'); // GOOD
  });

  it('multiple wrong notes then correct → RECOVERED badge', () => {
    ctx.engine.loadLesson(makeV2Lesson([
      { notes: [60], start_beat: 0 },
      { notes: [62], start_beat: 1 },
    ]));

    simulateMidiInput(ctx, 99); // hard error 1
    simulateMidiInput(ctx, 98); // hard error 2
    simulateMidiInput(ctx, 60); // correct

    expect(badgeEl.textContent).toBe('Recuperou'); // RECOVERED
  });
});

// ============================================================
// Anti-regression: V1 engine safety
// ============================================================

describe('Anti-regression: V1 engine with Step Quality API', () => {
  it('V1 setUseStepQuality + getStepQualities are no-ops', () => {
    const engine = createEngineV1();
    engine.setUseStepQuality(true);
    engine.loadLesson(makeV1Lesson());
    engine.onMidiInput(60, 100, true);
    expect(engine.getStepQualities()).toEqual([]);
  });
});
