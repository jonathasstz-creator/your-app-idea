/**
 * MIDI Onboarding — Feature Flag Integration
 *
 * Connects onboarding eligibility to the project's feature flag system.
 * Provides a reactive check that responds to runtime flag changes.
 */

import { featureFlags } from '../feature-flags/store';
import type { FeatureFlags } from '../feature-flags/types';

/** Read current flag value synchronously */
export function isMidiOnboardingEnabled(): boolean {
  return featureFlags.get('enableMidiOnboarding');
}

/**
 * Subscribe to flag changes. Callback fires when enableMidiOnboarding changes.
 * Returns unsubscribe function.
 */
export function onMidiOnboardingFlagChange(
  callback: (enabled: boolean) => void
): () => void {
  return featureFlags.subscribe((next: FeatureFlags, meta) => {
    // Only fire when this specific flag changed, or on initial exposure
    if (meta.name === 'enableMidiOnboarding' || meta.source === 'default') {
      callback(next.enableMidiOnboarding);
    }
  });
}
