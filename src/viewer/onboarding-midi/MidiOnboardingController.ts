/**
 * MIDI Onboarding — Controller
 *
 * Bridges the OnboardingFlow (pure logic) with the WebMidiService and UI.
 * Created once, gated by feature flag. Zero impact when flag is OFF.
 */

import { OnboardingFlow, OnboardingListener } from './OnboardingFlow';
import type { OnboardingState } from './types';
import type { WebMidiService, MidiNoteEvent } from '../webmidi-service';

export class MidiOnboardingController {
  private flow: OnboardingFlow;
  private midiUnsubscribe: (() => void) | null = null;
  private destroyed = false;

  constructor() {
    this.flow = new OnboardingFlow();
  }

  /** Wire to MIDI service for note events */
  attachMidi(midiService: WebMidiService): void {
    // Listen for note events
    const handler = (event: MidiNoteEvent) => {
      if (event.type === 'note_on' && event.velocity > 0) {
        this.flow.onMidiNote(event.midi);
      }
    };
    midiService.onNoteEvent(handler);
    // Store handler ref for potential future cleanup
    this.midiUnsubscribe = () => {
      // WebMidiService doesn't expose offNoteEvent — acceptable leak on destroy
      // since onboarding is created once per session
    };

    // Listen for connection state
    midiService.onStateChange((state) => {
      this.flow.setMidiConnected(state.connected);
    });
  }

  /** Subscribe to flow state changes (for UI rendering) */
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

  /** Check if onboarding should be shown */
  static shouldShow(flagEnabled: boolean, hasProgress: boolean): boolean {
    return OnboardingFlow.shouldShow(flagEnabled, hasProgress);
  }

  /** Check if already completed */
  static isCompleted(): boolean {
    return OnboardingFlow.isCompleted();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.midiUnsubscribe) {
      this.midiUnsubscribe();
      this.midiUnsubscribe = null;
    }
  }
}
