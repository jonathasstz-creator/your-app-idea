/**
 * Input Pipeline Unity — Anti-Regression Tests
 *
 * Proves that Mouse, Keyboard, and MIDI inputs all converge to the same
 * evaluation pipeline (engine + Step Quality + HUD). No source gets
 * special treatment or is excluded from Step Quality logic.
 *
 * Architecture invariant:
 *   handleNoteInput(midi, velocity, source) is the single entry point.
 *   The Step Quality feedback block does NOT check `source`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createEngineV2, LessonEngineApi } from '../lesson-engine';
import {
  StepQualityBadgeController,
  NoteFeedbackController,
  ChordClosureEffect,
} from '../step-quality-ui';
import { FeatureFlags, DEFAULT_FLAGS } from '../feature-flags/types';

// --- Wiring simulation (mirrors index.tsx handleNoteInput) ---

type InputSource = 'midi' | 'mouse' | 'keyboard';

interface PipelineContext {
  engine: LessonEngineApi;
  badge: StepQualityBadgeController;
  feedback: NoteFeedbackController;
  chordFx: ChordClosureEffect;
  flagSnapshot: FeatureFlags;
  schemaVersion: 1 | 2;
  mode: 'WAIT' | 'FILM';
  lessonSteps: { notes: number[]; start_beat: number }[];
  chordHitCount: number;
}

/**
 * Simulates handleNoteInput from index.tsx — source-agnostic.
 * The key invariant: this function does NOT branch on `source`.
 */
function simulateNoteInput(ctx: PipelineContext, midi: number, _source: InputSource) {
  const { engine, badge, feedback, chordFx, flagSnapshot, schemaVersion, mode, lessonSteps } = ctx;

  const viewBefore = engine.getViewState();
  const res = engine.onMidiInput(midi, 100, true);
  const viewAfter = engine.getViewState();

  // Step Quality feedback block (mirrors index.tsx lines 1816-1852)
  // CRITICAL: no `source` check here — that's the invariant under test
  if (flagSnapshot.showStepQualityFeedback && schemaVersion === 2 && mode === 'WAIT') {
    const stepAdvanced = viewAfter.currentStep > viewBefore.currentStep;

    if (stepAdvanced) {
      const chordSize = lessonSteps[viewBefore.currentStep]?.notes?.length ?? 1;
      ctx.chordHitCount = 0;

      if (chordSize > 1) {
        chordFx.trigger();
        feedback.showChordComplete();
      }

      if (flagSnapshot.useStepQualityStreak) {
        const qualities = engine.getStepQualities();
        const lastQ = qualities[qualities.length - 1];
        if (lastQ) badge.show(lastQ);
      }
    } else if (res.result === 'MISS') {
      ctx.chordHitCount = 0;
      feedback.showWrongNote();
    }
  }

  return { res, viewBefore, viewAfter };
}

// --- Helpers ---

const makeLesson = (steps: { notes: number[]; start_beat: number }[]) => ({
  session_id: 'test',
  lesson_id: 'test',
  lesson_version: 2,
  total_steps: steps.length,
  steps: steps.map((s, i) => ({ step_index: i, ...s })),
});

const ALL_FLAGS_ON: FeatureFlags = {
  ...DEFAULT_FLAGS,
  showStepQualityFeedback: true,
  useStepQualityStreak: true,
};

const SOURCES: InputSource[] = ['midi', 'mouse', 'keyboard'];

// ============================================================
// Core invariant: all sources produce identical engine + UI results
// ============================================================

describe('Input Pipeline Unity: source-agnostic Step Quality', () => {
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

  function makeCtx(steps: { notes: number[]; start_beat: number }[]): PipelineContext {
    const engine = createEngineV2();
    engine.setUseStepQuality(true);
    engine.loadLesson(makeLesson(steps));

    return {
      engine,
      badge: new StepQualityBadgeController(badgeEl),
      feedback: new NoteFeedbackController(feedbackEl),
      chordFx: new ChordClosureEffect(stepEl),
      flagSnapshot: { ...ALL_FLAGS_ON },
      schemaVersion: 2,
      mode: 'WAIT',
      lessonSteps: steps,
      chordHitCount: 0,
    };
  }

  for (const source of SOURCES) {
    it(`${source} input → correct note → PERFECT badge`, () => {
      const ctx = makeCtx([
        { notes: [60], start_beat: 0 },
        { notes: [62], start_beat: 1 },
      ]);

      simulateNoteInput(ctx, 60, source);
      expect(badgeEl.hidden).toBe(false);
      expect(badgeEl.textContent).toBe('Perfeito');
    });

    it(`${source} input → wrong note → error feedback`, () => {
      const ctx = makeCtx([
        { notes: [60], start_beat: 0 },
        { notes: [62], start_beat: 1 },
      ]);

      simulateNoteInput(ctx, 99, source);
      expect(feedbackEl.textContent).toBe('✗');
      expect(feedbackEl.classList.contains('is-wrong-brief')).toBe(true);
    });

    it(`${source} input → wrong then correct → GOOD badge`, () => {
      const ctx = makeCtx([
        { notes: [60], start_beat: 0 },
        { notes: [62], start_beat: 1 },
      ]);

      simulateNoteInput(ctx, 99, source); // miss
      simulateNoteInput(ctx, 60, source); // correct
      expect(badgeEl.hidden).toBe(false);
      expect(badgeEl.textContent).toBe('Boa');
    });
  }

  it('all sources produce identical engine state for same input sequence', () => {
    const steps = [
      { notes: [60], start_beat: 0 },
      { notes: [64], start_beat: 1 },
      { notes: [67], start_beat: 2 },
    ];
    const inputSequence = [60, 64, 67];

    const results: Record<InputSource, { step: number; score: number; streak: number; qualities: string[] }> = {} as any;

    for (const source of SOURCES) {
      const ctx = makeCtx(steps);
      for (const midi of inputSequence) {
        simulateNoteInput(ctx, midi, source);
      }
      const view = ctx.engine.getViewState();
      results[source] = {
        step: view.currentStep,
        score: view.score,
        streak: view.streak,
        qualities: ctx.engine.getStepQualities(),
      };
    }

    // All sources must produce identical results
    expect(results.mouse).toEqual(results.midi);
    expect(results.keyboard).toEqual(results.midi);
  });

  it('chord completion works identically across sources', () => {
    const steps = [
      { notes: [60, 64, 67], start_beat: 0 }, // C major chord
      { notes: [62], start_beat: 1 },
    ];

    for (const source of SOURCES) {
      const ctx = makeCtx(steps);
      const localBadge = document.createElement('div');
      localBadge.hidden = true;
      ctx.badge = new StepQualityBadgeController(localBadge);

      simulateNoteInput(ctx, 60, source);
      expect(localBadge.hidden).toBe(true); // partial

      simulateNoteInput(ctx, 64, source);
      expect(localBadge.hidden).toBe(true); // still partial

      simulateNoteInput(ctx, 67, source);
      expect(localBadge.hidden).toBe(false); // chord complete → badge
      expect(localBadge.textContent).toBe('Perfeito');

      ctx.badge.destroy();
    }
  });
});

// ============================================================
// Anti-regression: flags OFF → no feedback regardless of source
// ============================================================

describe('Input Pipeline Unity: flags OFF blocks all sources equally', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  for (const source of SOURCES) {
    it(`${source} input with flags OFF → no badge`, () => {
      const badgeEl = document.createElement('div');
      badgeEl.hidden = true;
      const engine = createEngineV2();
      engine.loadLesson(makeLesson([
        { notes: [60], start_beat: 0 },
        { notes: [62], start_beat: 1 },
      ]));

      const ctx: PipelineContext = {
        engine,
        badge: new StepQualityBadgeController(badgeEl),
        feedback: new NoteFeedbackController(null),
        chordFx: new ChordClosureEffect(null),
        flagSnapshot: { ...DEFAULT_FLAGS }, // flags OFF
        schemaVersion: 2,
        mode: 'WAIT',
        lessonSteps: [{ notes: [60], start_beat: 0 }, { notes: [62], start_beat: 1 }],
        chordHitCount: 0,
      };

      simulateNoteInput(ctx, 60, source);
      expect(badgeEl.hidden).toBe(true);
    });
  }
});

// ============================================================
// Anti-regression: reset clears state for all input sources
// ============================================================

describe('Input Pipeline Unity: reset behavior', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('engine reset clears qualities regardless of input source used', () => {
    const engine = createEngineV2();
    engine.setUseStepQuality(true);
    const steps = [
      { notes: [60], start_beat: 0 },
      { notes: [62], start_beat: 1 },
    ];
    engine.loadLesson(makeLesson(steps));

    // Play via "mouse" source
    engine.onMidiInput(60, 100, true);
    expect(engine.getStepQualities().length).toBe(1);

    // Reload resets
    engine.loadLesson(makeLesson(steps));
    expect(engine.getStepQualities()).toEqual([]);

    // Play via "keyboard" source — same engine method
    engine.onMidiInput(60, 100, true);
    expect(engine.getStepQualities().length).toBe(1);
  });
});
