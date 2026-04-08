/**
 * PR2 — Step Quality UX Layer Tests
 *
 * Tests for presentational helpers: labels, CSS classes,
 * badge controller, note feedback controller, chord closure.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  STEP_QUALITY_LABEL,
  STEP_QUALITY_CSS_CLASS,
  StepQualityBadgeController,
  NoteFeedbackController,
  ChordClosureEffect,
} from '../step-quality-ui';
import { StepQuality } from '../types/step-quality';

// ============================================================
// Pure mappings
// ============================================================

describe('STEP_QUALITY_LABEL', () => {
  it('maps all 4 qualities to Portuguese labels', () => {
    expect(STEP_QUALITY_LABEL.PERFECT).toBe('Perfeito');
    expect(STEP_QUALITY_LABEL.GREAT).toBe('Ótimo');
    expect(STEP_QUALITY_LABEL.GOOD).toBe('Boa');
    expect(STEP_QUALITY_LABEL.RECOVERED).toBe('Recuperou');
  });
});

describe('STEP_QUALITY_CSS_CLASS', () => {
  it('maps all 4 qualities to CSS classes', () => {
    const qualities: StepQuality[] = ['PERFECT', 'GREAT', 'GOOD', 'RECOVERED'];
    qualities.forEach((q) => {
      expect(STEP_QUALITY_CSS_CLASS[q]).toMatch(/^quality-/);
    });
  });
});

// ============================================================
// Badge Controller (DOM)
// ============================================================

describe('StepQualityBadgeController', () => {
  let el: HTMLDivElement;
  let badge: StepQualityBadgeController;

  beforeEach(() => {
    vi.useFakeTimers();
    el = document.createElement('div');
    el.hidden = true;
    el.className = 'quality-badge';
    badge = new StepQualityBadgeController(el);
  });

  afterEach(() => {
    badge.destroy();
    vi.useRealTimers();
  });

  it('show() reveals element with correct label and class', () => {
    badge.show('PERFECT');
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe('Perfeito');
    expect(el.classList.contains('quality-perfect')).toBe(true);
    expect(el.classList.contains('quality-badge-enter')).toBe(true);
  });

  it('show() auto-hides after timeout', () => {
    badge.show('GREAT');
    expect(el.hidden).toBe(false);

    // Advance past show duration (1200ms)
    vi.advanceTimersByTime(600);
    expect(el.classList.contains('quality-badge-exit')).toBe(true);

    // Advance past exit animation (300ms)
    vi.advanceTimersByTime(300);
    expect(el.hidden).toBe(true);
  });

  it('show() replaces previous badge without stacking', () => {
    badge.show('PERFECT');
    badge.show('GOOD');
    expect(el.textContent).toBe('Boa');
    expect(el.classList.contains('quality-good')).toBe(true);
    expect(el.classList.contains('quality-perfect')).toBe(false);
  });

  it('clear() hides immediately and resets class', () => {
    badge.show('RECOVERED');
    badge.clear();
    expect(el.hidden).toBe(true);
    expect(el.className).toBe('quality-badge');
  });

  it('destroy() nullifies element reference', () => {
    badge.destroy();
    // Should not throw on subsequent calls
    badge.show('PERFECT');
    badge.clear();
  });
});

// ============================================================
// Note Feedback Controller
// ============================================================

describe('NoteFeedbackController', () => {
  let el: HTMLDivElement;
  let feedback: NoteFeedbackController;

  beforeEach(() => {
    vi.useFakeTimers();
    el = document.createElement('div');
    el.className = 'judge-feedback';
    feedback = new NoteFeedbackController(el);
  });

  afterEach(() => {
    feedback.destroy();
    vi.useRealTimers();
  });

  it('showPartialHit displays chord progress', () => {
    feedback.showPartialHit(2, 3);
    expect(el.textContent).toBe('♪ 2/3');
    expect(el.classList.contains('is-partial')).toBe(true);
  });

  it('showPartialHit skips for single-note steps', () => {
    el.textContent = 'original';
    feedback.showPartialHit(1, 1);
    expect(el.textContent).toBe('original'); // unchanged
  });

  it('showChordComplete shows checkmark and auto-clears', () => {
    feedback.showChordComplete();
    expect(el.textContent).toBe('✓');
    expect(el.classList.contains('is-chord-complete')).toBe(true);

    vi.advanceTimersByTime(600);
    expect(el.textContent).toBe('');
    expect(el.className).toBe('judge-feedback');
  });

  it('showWrongNote shows error and auto-clears', () => {
    feedback.showWrongNote();
    expect(el.textContent).toBe('✗');
    expect(el.classList.contains('is-wrong-brief')).toBe(true);

    vi.advanceTimersByTime(400);
    expect(el.textContent).toBe('');
  });

  it('showDuplicate adds and removes flash class', () => {
    feedback.showDuplicate();
    expect(el.classList.contains('is-duplicate-flash')).toBe(true);

    vi.advanceTimersByTime(200);
    expect(el.classList.contains('is-duplicate-flash')).toBe(false);
  });

  it('clear() resets to clean state', () => {
    feedback.showWrongNote();
    feedback.clear();
    expect(el.textContent).toBe('');
    expect(el.className).toBe('judge-feedback');
  });

  it('rapid calls cancel previous timers (no stacking)', () => {
    feedback.showWrongNote();
    feedback.showChordComplete();
    // Should show chord complete, not wrong
    expect(el.textContent).toBe('✓');
    expect(el.classList.contains('is-chord-complete')).toBe(true);
  });
});

// ============================================================
// Chord Closure Effect
// ============================================================

describe('ChordClosureEffect', () => {
  let el: HTMLDivElement;
  let effect: ChordClosureEffect;

  beforeEach(() => {
    vi.useFakeTimers();
    el = document.createElement('div');
    effect = new ChordClosureEffect(el);
  });

  afterEach(() => {
    effect.destroy();
    vi.useRealTimers();
  });

  it('trigger() adds pulse class', () => {
    effect.trigger();
    expect(el.classList.contains('chord-closure-pulse')).toBe(true);
  });

  it('trigger() auto-removes pulse after timeout', () => {
    effect.trigger();
    vi.advanceTimersByTime(500);
    expect(el.classList.contains('chord-closure-pulse')).toBe(false);
  });

  it('clear() removes pulse immediately', () => {
    effect.trigger();
    effect.clear();
    expect(el.classList.contains('chord-closure-pulse')).toBe(false);
  });

  it('rapid triggers do not stack classes', () => {
    effect.trigger();
    effect.trigger();
    effect.trigger();
    // Only one pulse class
    expect(el.className.split('chord-closure-pulse').length - 1).toBe(1);
  });
});

// ============================================================
// Flag-off guard: controllers are safe with null elements
// ============================================================

describe('Controllers with null elements', () => {
  it('BadgeController does not throw with null element', () => {
    const badge = new StepQualityBadgeController(null);
    expect(() => badge.show('PERFECT')).not.toThrow();
    expect(() => badge.clear()).not.toThrow();
    badge.destroy();
  });

  it('NoteFeedbackController does not throw with null element', () => {
    const fb = new NoteFeedbackController(null);
    expect(() => fb.showPartialHit(1, 3)).not.toThrow();
    expect(() => fb.showChordComplete()).not.toThrow();
    expect(() => fb.showWrongNote()).not.toThrow();
    expect(() => fb.showDuplicate()).not.toThrow();
    fb.destroy();
  });

  it('ChordClosureEffect does not throw with null element', () => {
    const fx = new ChordClosureEffect(null);
    expect(() => fx.trigger()).not.toThrow();
    expect(() => fx.clear()).not.toThrow();
    fx.destroy();
  });
});
