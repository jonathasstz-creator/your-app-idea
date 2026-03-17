/**
 * MIDI Onboarding — Flow Controller (pure logic, no DOM)
 *
 * Manages onboarding state machine. Decoupled from UI and engine.
 * Delegates persistence to OnboardingStorage, analytics to onboardingAnalytics.
 */

import {
  OnboardingState,
  OnboardingStep,
  DEFAULT_STEPS,
} from './types';
import { OnboardingStorage, CURRENT_VERSION } from './storage';
import { onboardingAnalytics } from './analytics';

export type OnboardingListener = (state: OnboardingState) => void;

export class OnboardingFlow {
  private state: OnboardingState;
  private listeners = new Set<OnboardingListener>();
  private sequenceProgress = 0; // tracks notes matched in simple-sequence step
  private storage: OnboardingStorage;

  constructor(storage?: OnboardingStorage) {
    this.storage = storage ?? new OnboardingStorage();
    this.state = {
      currentStepIndex: 0,
      steps: DEFAULT_STEPS.map((s) => ({ ...s })),
      midiConnected: false,
      aborted: false,
      completed: false,
      startedAt: Date.now(),
    };
  }

  /** Check if user is eligible for onboarding */
  static isEligible(
    flagEnabled: boolean,
    hasProgress: boolean,
    storage?: OnboardingStorage
  ): boolean {
    const s = storage ?? new OnboardingStorage();
    return s.isEligible(flagEnabled, hasProgress);
  }

  /** Start the onboarding (emit analytics) */
  start(): void {
    this.storage.touchLastSeen();
    onboardingAnalytics.started(CURRENT_VERSION);
    onboardingAnalytics.stepViewed(
      this.state.steps[0].id,
      0,
      this.state.steps.length
    );
  }

  getState(): Readonly<OnboardingState> {
    return { ...this.state, steps: this.state.steps.map((s) => ({ ...s })) };
  }

  getCurrentStep(): OnboardingStep | null {
    if (this.state.completed || this.state.aborted) return null;
    return this.state.steps[this.state.currentStepIndex] ?? null;
  }

  subscribe(fn: OnboardingListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Mark MIDI as connected */
  setMidiConnected(connected: boolean): void {
    this.state = { ...this.state, midiConnected: connected };
    const current = this.getCurrentStep();
    if (connected && current?.id === 'midi-connection') {
      onboardingAnalytics.midiConnected();
      this.completeCurrentStep();
      return;
    }
    this.notify();
  }

  /** Handle MIDI note input during onboarding */
  onMidiNote(midi: number): void {
    const current = this.getCurrentStep();
    if (!current || !current.requiresMidi) return;

    if (current.id === 'first-notes') {
      onboardingAnalytics.firstNoteHit(midi);
      this.completeCurrentStep();
      return;
    }

    if (current.id === 'simple-sequence' && current.targetNotes) {
      const nextExpected = current.targetNotes[this.sequenceProgress];
      if (midi === nextExpected) {
        this.sequenceProgress++;
        if (this.sequenceProgress >= current.targetNotes.length) {
          this.sequenceProgress = 0;
          this.completeCurrentStep();
        } else {
          this.notify();
        }
      }
      return;
    }
  }

  /** Complete the current step and advance */
  completeCurrentStep(): void {
    if (this.state.completed || this.state.aborted) return;
    const idx = this.state.currentStepIndex;
    if (idx >= this.state.steps.length) return;

    const completedStep = this.state.steps[idx];
    onboardingAnalytics.stepCompleted(completedStep.id, idx);

    const steps = this.state.steps.map((s, i) =>
      i === idx ? { ...s, completed: true } : { ...s }
    );

    const nextIdx = idx + 1;
    const isFinished = nextIdx >= steps.length;

    this.state = {
      ...this.state,
      steps,
      currentStepIndex: isFinished ? idx : nextIdx,
      completed: isFinished,
      completedAt: isFinished ? Date.now() : undefined,
    };

    if (isFinished) {
      this.storage.markCompleted();
      onboardingAnalytics.completed(
        Date.now() - this.state.startedAt,
        CURRENT_VERSION
      );
    } else {
      const nextStep = steps[nextIdx];
      if (nextStep) {
        onboardingAnalytics.stepViewed(nextStep.id, nextIdx, steps.length);
      }
    }

    this.sequenceProgress = 0;
    this.notify();
  }

  /** Skip current step */
  skipCurrentStep(): void {
    const current = this.getCurrentStep();
    if (current) {
      onboardingAnalytics.skipped(current.id, this.state.currentStepIndex);
    }
    this.completeCurrentStep();
  }

  /** Abort onboarding entirely — user goes to hub */
  abort(): void {
    const current = this.getCurrentStep();
    if (current) {
      onboardingAnalytics.skipped(current.id, this.state.currentStepIndex);
    }
    this.storage.markDismissed();
    this.state = { ...this.state, aborted: true };
    this.notify();
  }

  /** Reset (for testing/debug) */
  reset(): void {
    this.storage.clear();
    this.sequenceProgress = 0;
    this.state = {
      currentStepIndex: 0,
      steps: DEFAULT_STEPS.map((s) => ({ ...s })),
      midiConnected: false,
      aborted: false,
      completed: false,
      startedAt: Date.now(),
    };
    this.notify();
  }

  private notify(): void {
    const snap = this.getState();
    for (const fn of this.listeners) {
      try {
        fn(snap);
      } catch (e) {
        console.error('[OnboardingMIDI] listener error', e);
      }
    }
  }
}
