/**
 * Step Quality System — V2 Polyphonic Engine
 *
 * Classifies each completed step by quality (PERFECT → RECOVERED),
 * enabling nuanced streak and scoring that feels "exigente, mas nunca injusto".
 *
 * Soft errors (duplicates, single exploration) don't break flow.
 * Hard errors (wrong notes, brute-force) impact streak and score.
 */

// ============================================================
// Step Quality
// ============================================================

export type StepQuality = 'PERFECT' | 'GREAT' | 'GOOD' | 'RECOVERED';

export function classifyStepQuality(hardErrors: number, softErrors: number): StepQuality {
  if (hardErrors === 0 && softErrors === 0) return 'PERFECT';
  if (hardErrors === 0 && softErrors <= 1) return 'GREAT';
  if (hardErrors <= 1) return 'GOOD';
  return 'RECOVERED';
}

// ============================================================
// Input Classification
// ============================================================

export type InputClassification =
  | 'CORRECT_NEW_NOTE'
  | 'CORRECT_DUPLICATE_NOTE'
  | 'EXTRA_WRONG_NOTE';

// ============================================================
// Per-step tracking state (internal to engine)
// ============================================================

export interface StepQualityState {
  softErrorCount: number;
  hardErrorCount: number;
  quality: StepQuality | null; // set on completion
}

export function createStepQualityState(): StepQualityState {
  return { softErrorCount: 0, hardErrorCount: 0, quality: null };
}

// ============================================================
// Score rewards per quality
// ============================================================

export const STEP_QUALITY_SCORE: Record<StepQuality, number> = {
  PERFECT: 100,
  GREAT: 80,
  GOOD: 50,
  RECOVERED: 30,
};

// ============================================================
// Streak rules
// ============================================================

/** Threshold: hard errors that break streak mid-step */
export const HARD_ERROR_BREAK_THRESHOLD = 3;

/**
 * Determine streak change after step completion.
 * Returns delta: +1, 0, or -streak (reset).
 */
export function computeStreakDelta(
  quality: StepQuality,
  currentStreak: number
): number {
  switch (quality) {
    case 'PERFECT':
    case 'GREAT':
      return 1; // streak goes up
    case 'GOOD':
      // "damage" streak if high, otherwise hold
      return currentStreak >= 5 ? -1 : 0;
    case 'RECOVERED':
      return currentStreak > 0 ? -currentStreak : 0; // reset to 0
  }
}
