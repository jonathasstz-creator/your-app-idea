import { FeatureFlags } from '../types';

const STORAGE_KEY = 'viewer:featureFlags:v1';

const isObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null && !Array.isArray(val);

export class LocalFeatureFlagProvider {
  load(): Promise<Partial<FeatureFlags>> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return Promise.resolve({});
      const parsed = JSON.parse(raw);
      if (!isObject(parsed)) return Promise.resolve({});
      const next: Partial<FeatureFlags> = {};
      if (typeof parsed.showSheetMusic === 'boolean') next.showSheetMusic = parsed.showSheetMusic;
      if (typeof parsed.showFallingNotes === 'boolean') next.showFallingNotes = parsed.showFallingNotes;
      return Promise.resolve(next);
    } catch (error) {
      console.warn('[FeatureFlags] Failed to read localStorage', error);
      return Promise.resolve({});
    }
  }

  save(flags: FeatureFlags) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
    } catch (error) {
      console.warn('[FeatureFlags] Failed to persist localStorage', error);
    }
  }
}

export const createLocalProvider = () => new LocalFeatureFlagProvider();
