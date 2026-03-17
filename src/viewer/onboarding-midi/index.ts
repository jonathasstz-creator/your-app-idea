/**
 * MIDI Onboarding — Module Index
 *
 * Single import point for the onboarding module.
 */

export { MidiOnboardingController } from './MidiOnboardingController';
export { MidiOnboardingOverlay } from './MidiOnboardingOverlay';
export { OnboardingFlow } from './OnboardingFlow';
export { OnboardingStorage, CURRENT_VERSION } from './storage';
export { isMidiOnboardingEnabled, onMidiOnboardingFlagChange } from './feature-flag';
export { onboardingAnalytics } from './analytics';
export { ONBOARDING_CONFIG, DEFAULT_STEPS } from './types';
export type {
  OnboardingState,
  OnboardingStep,
  OnboardingStepId,
  OnboardingConfig,
} from './types';
