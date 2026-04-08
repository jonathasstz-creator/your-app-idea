/**
 * PR2 — Step Quality UX Layer
 *
 * Presentational controllers for step quality feedback.
 * Pure UI layer — reads from engine, never mutates gameplay state.
 * Gated by feature flag `showStepQualityFeedback`.
 */

import { StepQuality } from './types/step-quality';

// ============================================================
// Labels & Colors (Portuguese, musical tone)
// ============================================================

export const STEP_QUALITY_LABEL: Record<StepQuality, string> = {
  PERFECT: 'Perfeito',
  GREAT: 'Ótimo',
  GOOD: 'Boa',
  RECOVERED: 'Recuperou',
};

export const STEP_QUALITY_CSS_CLASS: Record<StepQuality, string> = {
  PERFECT: 'quality-perfect',
  GREAT: 'quality-great',
  GOOD: 'quality-good',
  RECOVERED: 'quality-recovered',
};

// ============================================================
// Quality Badge Controller
// ============================================================

export class StepQualityBadgeController {
  private el: HTMLElement | null;
  private hideTimer: number | null = null;

  constructor(element?: HTMLElement | null) {
    this.el = element ?? document.getElementById('hud-quality-badge');
  }

  show(quality: StepQuality) {
    if (!this.el) return;
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    this.el.textContent = STEP_QUALITY_LABEL[quality];
    this.el.className = `quality-badge ${STEP_QUALITY_CSS_CLASS[quality]} quality-badge-enter`;
    this.el.hidden = false;

    this.hideTimer = window.setTimeout(() => {
      if (!this.el) return;
      this.el.classList.remove('quality-badge-enter');
      this.el.classList.add('quality-badge-exit');
      setTimeout(() => {
        if (this.el) {
          this.el.hidden = true;
          this.el.classList.remove('quality-badge-exit');
        }
      }, 300);
      this.hideTimer = null;
    }, 1200);
  }

  clear() {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.el) {
      this.el.hidden = true;
      this.el.className = 'quality-badge';
    }
  }

  destroy() {
    this.clear();
    this.el = null;
  }
}

// ============================================================
// Note Feedback Controller
// ============================================================

export class NoteFeedbackController {
  private el: HTMLElement | null;
  private feedbackTimer: number | null = null;

  constructor(element?: HTMLElement | null) {
    this.el = element ?? document.getElementById('judge-feedback');
  }

  showPartialHit(hitCount: number, totalCount: number) {
    if (!this.el || totalCount <= 1) return;
    this.clearFeedbackTimer();
    this.el.textContent = `♪ ${hitCount}/${totalCount}`;
    this.el.className = 'judge-feedback is-partial';
  }

  showChordComplete() {
    if (!this.el) return;
    this.clearFeedbackTimer();
    this.el.textContent = '✓ Certo';
    this.el.className = 'judge-feedback is-chord-complete';
    this.feedbackTimer = window.setTimeout(() => {
      if (this.el) {
        this.el.textContent = '';
        this.el.className = 'judge-feedback';
      }
      this.feedbackTimer = null;
    }, 1200);
  }

  showWrongNote() {
    if (!this.el) return;
    this.clearFeedbackTimer();
    this.el.textContent = '✗ Errado';
    this.el.className = 'judge-feedback is-wrong-brief';
    this.feedbackTimer = window.setTimeout(() => {
      if (this.el) {
        this.el.textContent = '';
        this.el.className = 'judge-feedback';
      }
      this.feedbackTimer = null;
    }, 800);
  }

  showDuplicate() {
    if (!this.el) return;
    this.el.classList.add('is-duplicate-flash');
    setTimeout(() => this.el?.classList.remove('is-duplicate-flash'), 200);
  }

  clear() {
    this.clearFeedbackTimer();
    if (this.el) {
      this.el.textContent = '';
      this.el.className = 'judge-feedback';
    }
  }

  private clearFeedbackTimer() {
    if (this.feedbackTimer !== null) {
      clearTimeout(this.feedbackTimer);
      this.feedbackTimer = null;
    }
  }

  destroy() {
    this.clear();
    this.el = null;
  }
}

// ============================================================
// Chord Closure Effect
// ============================================================

export class ChordClosureEffect {
  private el: HTMLElement | null;
  private timer: number | null = null;

  constructor(element?: HTMLElement | null) {
    this.el = element ?? document.getElementById('hud-step');
  }

  trigger() {
    if (!this.el) return;
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.el.classList.remove('chord-closure-pulse');
    // Force reflow for re-trigger
    void this.el.offsetWidth;
    this.el.classList.add('chord-closure-pulse');
    this.timer = window.setTimeout(() => {
      this.el?.classList.remove('chord-closure-pulse');
      this.timer = null;
    }, 500);
  }

  clear() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.el?.classList.remove('chord-closure-pulse');
  }

  destroy() {
    this.clear();
    this.el = null;
  }
}
