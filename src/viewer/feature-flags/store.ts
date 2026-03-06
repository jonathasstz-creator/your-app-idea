import { DEFAULT_FLAGS, FeatureFlagName, FeatureFlags, FeatureFlagProvider, FeatureFlagSubscriber, FlagSource } from './types';
import { createLocalProvider, LocalFeatureFlagProvider } from './providers/local';

class FeatureFlagStore {
  private state: FeatureFlags = { ...DEFAULT_FLAGS };
  private subscribers: Set<FeatureFlagSubscriber> = new Set();
  private provider: FeatureFlagProvider | null = null;
  private local: LocalFeatureFlagProvider = createLocalProvider();
  private exposuresEmitted = false;

  async init(provider?: FeatureFlagProvider): Promise<FeatureFlags> {
    this.provider = provider ?? null;
    // 1) defaults already in state
    // 2) local
    const local = await this.local.load();
    this.merge(local, 'localStorage');
    // 3) remote
    if (this.provider) {
      const remote = await this.provider.load();
      this.merge(remote, 'remote');
    }
    this.emitExposure();
    return this.snapshot();
  }

  get(name: FeatureFlagName): boolean {
    return this.state[name];
  }

  snapshot(): FeatureFlags {
    return { ...this.state };
  }

  subscribe(fn: FeatureFlagSubscriber): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  set(name: FeatureFlagName, value: boolean, source: FlagSource = 'runtime') {
    if (this.state[name] === value) return;
    const prev = this.snapshot();
    this.state = { ...this.state, [name]: value };
    this.persist();
    this.notify({ name, source, previous: prev });
  }

  async refreshRemote() {
    if (!this.provider?.refresh) return;
    const next = await this.provider.refresh();
    this.merge(next, 'remote');
  }

  private merge(next: Partial<FeatureFlags>, source: FlagSource) {
    if (!next || Object.keys(next).length === 0) return;
    const prev = this.snapshot();
    let changed = false;
    for (const key of Object.keys(next) as FeatureFlagName[]) {
      const val = next[key];
      if (typeof val === 'boolean' && this.state[key] !== val) {
        this.state[key] = val;
        changed = true;
      }
    }
    if (changed) {
      this.persist();
      this.notify({ source, previous: prev });
    }
  }

  private notify(meta: { name?: FeatureFlagName; source: FlagSource; previous?: FeatureFlags }) {
    const snap = this.snapshot();
    for (const fn of this.subscribers) {
      try {
        fn(snap, meta);
      } catch (error) {
        console.error('[FeatureFlags] subscriber failed', error);
      }
    }
  }

  private persist() {
    this.local.save(this.state);
  }

  private emitExposure() {
    if (this.exposuresEmitted) return;
    this.exposuresEmitted = true;
    this.notify({ source: 'default', previous: undefined });
  }
}

export const featureFlags = new FeatureFlagStore();

// Dev helper: expose on window so you can toggle from the console:
//   window.__flags.set('showNewCurriculum', true, 'runtime')
//   window.__flags.snapshot()
if (import.meta.env.DEV) {
  (window as any).__flags = featureFlags;
}
