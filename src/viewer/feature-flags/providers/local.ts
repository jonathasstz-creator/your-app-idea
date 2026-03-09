import { FeatureFlags, FeatureFlagName, DEFAULT_FLAGS } from '../types';

const STORAGE_KEY = 'viewer:featureFlags:v1';

const isObject = (val: unknown): val is Record<string, unknown> =>
  typeof val === 'object' && val !== null && !Array.isArray(val);

const FLAG_NAMES = Object.keys(DEFAULT_FLAGS) as FeatureFlagName[];

export class LocalFeatureFlagProvider {
  load(): Promise<Partial<FeatureFlags>> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return Promise.resolve({});
      const parsed = JSON.parse(raw);
      if (!isObject(parsed)) return Promise.resolve({});
      const next: Partial<FeatureFlags> = {};
      for (const key of FLAG_NAMES) {
        if (typeof parsed[key] === 'boolean') {
          next[key] = parsed[key] as boolean;
        }
      }
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
