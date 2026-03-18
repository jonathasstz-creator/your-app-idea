/**
 * MIDI Onboarding — Controller
 *
 * Bridges the OnboardingFlow (pure logic) with the WebMidiService and UI.
 * Created once per session, gated by feature flag. Zero impact when flag is OFF.
 *
 * Lifecycle: attachMidi() registers listeners with proper cleanup via destroy().
 */

import { OnboardingFlow, OnboardingListener } from './OnboardingFlow';
import { OnboardingStorage } from './storage';
import { onboardingAnalytics } from './analytics';
import type { OnboardingState } from './types';
import type { WebMidiService, MidiNoteEvent } from '../webmidi-service';

export class MidiOnboardingController {
  private flow: OnboardingFlow;
  private storage: OnboardingStorage;
  private destroyed = false;
  private cleanupFns: Array<() => void> = [];

  constructor(storage?: OnboardingStorage) {
    this.storage = storage ?? new OnboardingStorage();
    this.flow = new OnboardingFlow(this.storage);
  }

  /** Wire to MIDI service for note events. Returns cleanup function. */
  attachMidi(midiService: WebMidiService): () => void {
    const noteHandler = (event: MidiNoteEvent) => {
      if (this.destroyed) return;
      if (event.type === 'note_on' && event.velocity > 0) {
        this.flow.onMidiNote(event.midi);
      }
    };

    const stateHandler = (state: { connected: boolean }) => {
      if (this.destroyed) return;
      this.flow.setMidiConnected(state.connected);
    };

    const unsubNote = midiService.onNoteEvent(noteHandler);
    const unsubState = midiService.onStateChange(stateHandler);

    const cleanup = () => {
      unsubNote();
      unsubState();
    };

    this.cleanupFns.push(cleanup);
    return cleanup;
  }

  /** Start the onboarding flow */
  start(): void {
    this.flow.start();
  }

  subscribe(fn: OnboardingListener): () => void {
    return this.flow.subscribe(fn);
  }

  getState(): Readonly<OnboardingState> {
    return this.flow.getState();
  }

  getCurrentStep() {
    return this.flow.getCurrentStep();
  }

  skipStep(): void {
    this.flow.skipCurrentStep();
  }

  abort(): void {
    this.flow.abort();
  }

  completeStep(): void {
    this.flow.completeCurrentStep();
  }

  /** Check eligibility */
  static isEligible(flagEnabled: boolean, hasProgress: boolean): boolean {
    return OnboardingFlow.isEligible(flagEnabled, hasProgress);
  }

  /** Full cleanup: remove all MIDI listeners and mark as destroyed */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const fn of this.cleanupFns) {
      try { fn(); } catch { /* best-effort cleanup */ }
    }
    this.cleanupFns.length = 0;
  }
}
