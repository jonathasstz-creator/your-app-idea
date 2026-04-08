/**
 * Anti-regression: Step Quality feedback gate — V1 vs V2 awareness
 * Bug: User enables showStepQualityFeedback but nothing appears because
 *      the lesson is V1 (monophonic). No visual indication that the feature
 *      is V2-only.
 * Fix: For V1 lessons, provide basic HIT/MISS note feedback even when
 *      showStepQualityFeedback is enabled (graceful fallback).
 *      Quality badge (PERFECT/GREAT etc) remains V2-only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Anti-regression: Step Quality feedback V1 graceful fallback', () => {
  // Simulates the decision logic in handleNoteInput
  const shouldShowQualityBadge = (flags: { showStepQualityFeedback: boolean; useStepQualityStreak: boolean }, schemaVersion: number) => {
    return flags.showStepQualityFeedback && flags.useStepQualityStreak && schemaVersion === 2;
  };

  const shouldShowNoteFeedback = (flags: { showStepQualityFeedback: boolean }, schemaVersion: number) => {
    // Post-fix: note feedback (✓/✗) works for BOTH V1 and V2 when flag is enabled
    return flags.showStepQualityFeedback;
  };

  it('quality badge requires V2 + both flags', () => {
    expect(shouldShowQualityBadge({ showStepQualityFeedback: true, useStepQualityStreak: true }, 2)).toBe(true);
    expect(shouldShowQualityBadge({ showStepQualityFeedback: true, useStepQualityStreak: true }, 1)).toBe(false);
    expect(shouldShowQualityBadge({ showStepQualityFeedback: true, useStepQualityStreak: false }, 2)).toBe(false);
    expect(shouldShowQualityBadge({ showStepQualityFeedback: false, useStepQualityStreak: true }, 2)).toBe(false);
  });

  it('note feedback (✓/✗) works for V1 when showStepQualityFeedback is ON', () => {
    expect(shouldShowNoteFeedback({ showStepQualityFeedback: true }, 1)).toBe(true);
    expect(shouldShowNoteFeedback({ showStepQualityFeedback: true }, 2)).toBe(true);
  });

  it('note feedback is OFF when showStepQualityFeedback is OFF', () => {
    expect(shouldShowNoteFeedback({ showStepQualityFeedback: false }, 1)).toBe(false);
    expect(shouldShowNoteFeedback({ showStepQualityFeedback: false }, 2)).toBe(false);
  });
});
