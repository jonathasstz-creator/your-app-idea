export type FeatureFlagName =
  | 'showSheetMusic'
  | 'showFallingNotes'
  | 'showNewCurriculum'
  | 'useWebSocket';

export type FeatureFlags = Record<FeatureFlagName, boolean>;

export type FlagSource = 'default' | 'localStorage' | 'remote' | 'runtime';

export interface FeatureFlagProvider {
  load(): Promise<Partial<FeatureFlags>>;
  refresh?(): Promise<Partial<FeatureFlags>>;
}

export type FeatureFlagSubscriber = (
  next: FeatureFlags,
  meta: { name?: FeatureFlagName; source: FlagSource; previous?: FeatureFlags }
) => void;

export const DEFAULT_FLAGS: FeatureFlags = {
  showSheetMusic: true,
  showFallingNotes: true,
  showNewCurriculum: true,
  useWebSocket: false,
};
