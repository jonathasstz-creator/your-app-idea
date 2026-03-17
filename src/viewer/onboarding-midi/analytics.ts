/**
 * MIDI Onboarding — Analytics Events
 *
 * Structured event emitter for onboarding metrics.
 * Uses console.info as transport (future: wire to real analytics service).
 */

import type { OnboardingStepId } from './types';

const PREFIX = '[OnboardingMIDI:Analytics]';

export type OnboardingEvent =
  | 'onboarding_midi_started'
  | 'onboarding_midi_step_viewed'
  | 'onboarding_midi_step_completed'
  | 'onboarding_midi_midi_connected'
  | 'onboarding_midi_first_note_hit'
  | 'onboarding_midi_completed'
  | 'onboarding_midi_skipped'
  | 'onboarding_midi_failed';

interface EventPayload {
  event: OnboardingEvent;
  stepId?: OnboardingStepId;
  stepIndex?: number;
  totalSteps?: number;
  durationMs?: number;
  version?: string;
  [key: string]: unknown;
}

/** Emit an onboarding analytics event */
export function emitOnboardingEvent(payload: EventPayload): void {
  try {
    console.info(PREFIX, payload.event, payload);
    // Future: replace with real analytics transport
    // e.g., analyticsService.track(payload.event, payload);
  } catch {
    // Analytics should never break onboarding
  }
}

/** Convenience emitters */
export const onboardingAnalytics = {
  started(version: string) {
    emitOnboardingEvent({ event: 'onboarding_midi_started', version });
  },

  stepViewed(stepId: OnboardingStepId, stepIndex: number, totalSteps: number) {
    emitOnboardingEvent({
      event: 'onboarding_midi_step_viewed',
      stepId,
      stepIndex,
      totalSteps,
    });
  },

  stepCompleted(stepId: OnboardingStepId, stepIndex: number) {
    emitOnboardingEvent({
      event: 'onboarding_midi_step_completed',
      stepId,
      stepIndex,
    });
  },

  midiConnected() {
    emitOnboardingEvent({ event: 'onboarding_midi_midi_connected' });
  },

  firstNoteHit(midi: number) {
    emitOnboardingEvent({ event: 'onboarding_midi_first_note_hit', midi });
  },

  completed(durationMs: number, version: string) {
    emitOnboardingEvent({
      event: 'onboarding_midi_completed',
      durationMs,
      version,
    });
  },

  skipped(stepId: OnboardingStepId, stepIndex: number) {
    emitOnboardingEvent({
      event: 'onboarding_midi_skipped',
      stepId,
      stepIndex,
    });
  },

  failed(error: string, stepId?: OnboardingStepId) {
    emitOnboardingEvent({
      event: 'onboarding_midi_failed',
      error,
      stepId,
    });
  },
};
