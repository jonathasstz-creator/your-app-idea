export type FeatureFlagName =
  | 'showSheetMusic'
  | 'showFallingNotes'
  | 'showNewCurriculum'
  | 'showIntermediateCurriculum'
  | 'useWebSocket'
  | 'useStepQualityStreak'
  | 'showStepQualityFeedback'
  | 'enableMidiOnboarding'
  | 'hideHud'
  | 'enableGuestMode'
  | 'resizableSheet'
  | 'showStreakCounter';

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
  showIntermediateCurriculum: true,
  useWebSocket: false,
  useStepQualityStreak: false,
  showStepQualityFeedback: false,
  enableMidiOnboarding: false,
  hideHud: false,
  enableGuestMode: false,
  resizableSheet: false,
  showStreakCounter: true,
};
