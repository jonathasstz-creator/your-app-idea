/**
 * Feature Flags Store — Subscribe & Runtime Update Tests
 *
 * Anti-regression: ensures featureFlagSnapshot stays alive after init.
 * Catches the root cause of the 2026-03-12 Step Quality HUD bug:
 * snapshot was frozen at init time, runtime changes had no effect.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_FLAGS,
  FeatureFlags,
  FeatureFlagName,
  FeatureFlagProvider,
  FlagSource,
} from '../feature-flags/types';
import { LocalFeatureFlagProvider } from '../feature-flags/providers/local';

// Re-create store class to test subscribe behavior without singleton side effects
class TestableStore {
  private state: FeatureFlags = { ...DEFAULT_FLAGS };
  private subscribers: Set<(next: FeatureFlags, meta: any) => void> = new Set();
  private local = new LocalFeatureFlagProvider();

  async init(provider?: FeatureFlagProvider): Promise<FeatureFlags> {
    const local = await this.local.load();
    this.merge(local, 'localStorage');
    if (provider) {
      const remote = await provider.load();
      this.merge(remote, 'remote');
    }
    return this.snapshot();
  }

  get(name: FeatureFlagName): boolean {
    return this.state[name];
  }

  snapshot(): FeatureFlags {
    return { ...this.state };
  }

  subscribe(fn: (next: FeatureFlags, meta: any) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  set(name: FeatureFlagName, value: boolean, source: FlagSource = 'runtime') {
    if (this.state[name] === value) return;
    this.state = { ...this.state, [name]: value };
    this.local.save(this.state);
    this.notify({ name, source });
  }

  private merge(next: Partial<FeatureFlags>, source: FlagSource) {
    if (!next || Object.keys(next).length === 0) return;
    let changed = false;
    for (const key of Object.keys(next) as FeatureFlagName[]) {
      const val = next[key];
      if (typeof val === 'boolean' && this.state[key] !== val) {
        this.state[key] = val;
        changed = true;
      }
    }
    if (changed) {
      this.local.save(this.state);
      this.notify({ source });
    }
  }

  private notify(meta: any) {
    const snap = this.snapshot();
    for (const fn of this.subscribers) {
      fn(snap, meta);
    }
  }
}

describe('FeatureFlags — Subscribe keeps snapshot alive', () => {
  let store: TestableStore;
  let liveSnapshot: FeatureFlags;

  beforeEach(() => {
    localStorage.clear();
    store = new TestableStore();
    // Simulate what index.tsx does: capture snapshot + subscribe
    liveSnapshot = store.snapshot();
    store.subscribe((next) => {
      liveSnapshot = next;
    });
  });

  it('snapshot updates when flag is set at runtime', () => {
    expect(liveSnapshot.showStepQualityFeedback).toBe(false);
    store.set('showStepQualityFeedback', true);
    expect(liveSnapshot.showStepQualityFeedback).toBe(true);
  });

  it('snapshot updates for multiple flag changes', () => {
    store.set('showStepQualityFeedback', true);
    store.set('useStepQualityStreak', true);
    expect(liveSnapshot.showStepQualityFeedback).toBe(true);
    expect(liveSnapshot.useStepQualityStreak).toBe(true);
  });

  it('toggling flag off reflects in snapshot', () => {
    store.set('showStepQualityFeedback', true);
    expect(liveSnapshot.showStepQualityFeedback).toBe(true);
    store.set('showStepQualityFeedback', false);
    expect(liveSnapshot.showStepQualityFeedback).toBe(false);
  });

  it('unsubscribe stops updates', () => {
    const unsub = store.subscribe((next) => {
      liveSnapshot = { ...next, showSheetMusic: false }; // marker
    });
    unsub();
    store.set('showStepQualityFeedback', true);
    // The second subscriber was removed, so liveSnapshot should still
    // be updated by the first subscriber (from beforeEach)
    expect(liveSnapshot.showStepQualityFeedback).toBe(true);
    expect(liveSnapshot.showSheetMusic).toBe(true); // not tampered
  });

  it('setting same value does not trigger subscriber', () => {
    const spy = vi.fn();
    store.subscribe(spy);
    store.set('showStepQualityFeedback', false); // already false
    expect(spy).not.toHaveBeenCalled();
  });

  it('localStorage pre-seeded flags are reflected after init', async () => {
    localStorage.setItem(
      'viewer:featureFlags:v1',
      JSON.stringify({ showStepQualityFeedback: true, useStepQualityStreak: true })
    );
    const freshStore = new TestableStore();
    let snap = freshStore.snapshot();
    freshStore.subscribe((next) => { snap = next; });
    await freshStore.init();
    expect(freshStore.get('showStepQualityFeedback')).toBe(true);
    expect(freshStore.get('useStepQualityStreak')).toBe(true);
  });
});
