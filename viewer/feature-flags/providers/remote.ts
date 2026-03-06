import { FeatureFlagProvider, FeatureFlags } from '../types';

const DEFAULT_TIMEOUT_MS = 5000;

const parseBool = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  return undefined;
};

export class RemoteFeatureFlagProvider implements FeatureFlagProvider {
  private readonly url: string | null;
  private readonly timeoutMs: number;

  constructor(url?: string | null, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    this.url = url && url.trim() ? url.trim() : null;
    this.timeoutMs = timeoutMs;
  }

  async load(): Promise<Partial<FeatureFlags>> {
    if (!this.url) return {};
    return this.fetchFlags();
  }

  async refresh(): Promise<Partial<FeatureFlags>> {
    if (!this.url) return {};
    return this.fetchFlags();
  }

  private async fetchFlags(): Promise<Partial<FeatureFlags>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const next: Partial<FeatureFlags> = {};
      const sheet = parseBool((data as any)?.showSheetMusic);
      const falling = parseBool((data as any)?.showFallingNotes);
      if (typeof sheet === 'boolean') next.showSheetMusic = sheet;
      if (typeof falling === 'boolean') next.showFallingNotes = falling;
      return next;
    } catch (error) {
      console.warn('[FeatureFlags] Remote fetch failed', error);
      return {};
    } finally {
      clearTimeout(timer);
    }
  }
}

export const createRemoteFlagProvider = () => {
  const metaEnv = (import.meta as any).env ?? {};
  const url = metaEnv.VITE_FLAGS_REMOTE_URL ?? null;
  const timeout = Number(metaEnv.VITE_FLAGS_REMOTE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  return new RemoteFeatureFlagProvider(url, Number.isFinite(timeout) ? timeout : DEFAULT_TIMEOUT_MS);
};
