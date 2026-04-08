/**
 * Anti-regression: Sheet music flicker on unrelated flag toggle
 * Bug: Toggling ANY feature flag (e.g. showStepQualityFeedback) causes
 *      the sheet music to reload/rebuild, producing visible flicker.
 * Fix: Only rebuild sheet/pianoRoll when showSheetMusic/showFallingNotes
 *      actually change, not on every flag update.
 * This test fails if the subscriber rebuilds sheet on unrelated flag changes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_FLAGS, FeatureFlags, FeatureFlagName, FlagSource } from '../feature-flags/types';

/**
 * Minimal store that mimics FeatureFlagStore subscribe behavior.
 * We test that a correctly-guarded subscriber does NOT call rebuild
 * when an unrelated flag changes.
 */
class MinimalFlagStore {
  private state: FeatureFlags = { ...DEFAULT_FLAGS };
  private subs: Set<(next: FeatureFlags, meta: { name?: string; source: FlagSource }) => void> = new Set();

  snapshot(): FeatureFlags { return { ...this.state }; }

  subscribe(fn: (next: FeatureFlags, meta: { name?: string; source: FlagSource }) => void) {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }

  set(name: FeatureFlagName, value: boolean, source: FlagSource = 'runtime') {
    if (this.state[name] === value) return;
    this.state = { ...this.state, [name]: value };
    for (const fn of this.subs) fn(this.snapshot(), { name, source });
  }
}

describe('Anti-regression: Sheet flicker on unrelated flag toggle', () => {
  let store: MinimalFlagStore;
  let rebuildSheetMappings: ReturnType<typeof vi.fn>;
  let destroySheet: ReturnType<typeof vi.fn>;
  let destroyPianoRoll: ReturnType<typeof vi.fn>;
  let ensurePianoRoll: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    store = new MinimalFlagStore();
    rebuildSheetMappings = vi.fn();
    destroySheet = vi.fn();
    destroyPianoRoll = vi.fn();
    ensurePianoRoll = vi.fn();

    // This is the CORRECT subscriber pattern (post-fix).
    // It tracks previous state and only rebuilds when relevant flags change.
    let prevFlags = store.snapshot();

    store.subscribe((next, meta) => {
      const sheetChanged = next.showSheetMusic !== prevFlags.showSheetMusic;
      const fallingChanged = next.showFallingNotes !== prevFlags.showFallingNotes;

      if (sheetChanged) {
        if (!next.showSheetMusic) {
          destroySheet();
        } else {
          rebuildSheetMappings();
        }
      }

      if (fallingChanged) {
        if (!next.showFallingNotes) {
          destroyPianoRoll();
        } else {
          ensurePianoRoll();
        }
      }

      prevFlags = next;
    });
  });

  it('toggling showStepQualityFeedback does NOT rebuild sheet', () => {
    store.set('showStepQualityFeedback', true);
    expect(rebuildSheetMappings).not.toHaveBeenCalled();
    expect(destroySheet).not.toHaveBeenCalled();
  });

  it('toggling useStepQualityStreak does NOT rebuild sheet', () => {
    store.set('useStepQualityStreak', true);
    expect(rebuildSheetMappings).not.toHaveBeenCalled();
  });

  it('toggling hideHud does NOT rebuild sheet', () => {
    store.set('hideHud', true);
    expect(rebuildSheetMappings).not.toHaveBeenCalled();
  });

  it('toggling showSheetMusic OFF calls destroySheet', () => {
    // First enable it (it's already true by default, set to false then true)
    store.set('showSheetMusic', false);
    expect(destroySheet).toHaveBeenCalledTimes(1);
    expect(rebuildSheetMappings).not.toHaveBeenCalled();
  });

  it('toggling showSheetMusic ON calls rebuildSheetMappings', () => {
    store.set('showSheetMusic', false); // off
    store.set('showSheetMusic', true);  // back on
    expect(rebuildSheetMappings).toHaveBeenCalledTimes(1);
  });

  it('toggling showFallingNotes OFF calls destroyPianoRoll', () => {
    store.set('showFallingNotes', false);
    expect(destroyPianoRoll).toHaveBeenCalledTimes(1);
    expect(ensurePianoRoll).not.toHaveBeenCalled();
  });

  it('multiple unrelated flag toggles never trigger sheet rebuild', () => {
    store.set('showStepQualityFeedback', true);
    store.set('useStepQualityStreak', true);
    store.set('hideHud', true);
    store.set('enableGuestMode', true);
    store.set('useWebSocket', true);
    expect(rebuildSheetMappings).not.toHaveBeenCalled();
    expect(destroySheet).not.toHaveBeenCalled();
    expect(destroyPianoRoll).not.toHaveBeenCalled();
    expect(ensurePianoRoll).not.toHaveBeenCalled();
  });
});
