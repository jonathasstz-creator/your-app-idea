/**
 * TDD: MIDI Onboarding — OnboardingFlow + OnboardingStorage
 *
 * Tests for the pure onboarding state machine and storage layer.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { OnboardingFlow } from '../onboarding-midi/OnboardingFlow';
import { OnboardingStorage, CURRENT_VERSION } from '../onboarding-midi/storage';
import { ONBOARDING_CONFIG } from '../onboarding-midi/types';

describe('OnboardingStorage', () => {
  let storage: OnboardingStorage;

  beforeEach(() => {
    localStorage.clear();
    storage = new OnboardingStorage();
  });

  it('read returns defaults when empty', () => {
    const state = storage.read();
    expect(state.completed).toBe(false);
    expect(state.version).toBeNull();
    expect(state.dismissedAt).toBeNull();
  });

  it('markCompleted persists completion + version', () => {
    storage.markCompleted();
    const state = storage.read();
    expect(state.completed).toBe(true);
    expect(state.version).toBe(CURRENT_VERSION);
  });

  it('markDismissed persists dismiss timestamp', () => {
    storage.markDismissed();
    const state = storage.read();
    expect(state.dismissedAt).toBeGreaterThan(0);
  });

  it('clear removes all keys', () => {
    storage.markCompleted();
    storage.markDismissed();
    storage.clear();
    const state = storage.read();
    expect(state.completed).toBe(false);
    expect(state.version).toBeNull();
    expect(state.dismissedAt).toBeNull();
  });

  // Eligibility
  it('isEligible: true when flag ON + not completed + no progress', () => {
    expect(storage.isEligible(true, false)).toBe(true);
  });

  it('isEligible: false when flag OFF', () => {
    expect(storage.isEligible(false, false)).toBe(false);
  });

  it('isEligible: false when completed current version', () => {
    storage.markCompleted();
    expect(storage.isEligible(true, false)).toBe(false);
  });

  it('isEligible: false when user has progress', () => {
    expect(storage.isEligible(true, true)).toBe(false);
  });

  it('isEligible: true when completed old version (re-onboarding)', () => {
    localStorage.setItem('midi_onboarding_completed', 'true');
    localStorage.setItem('midi_onboarding_version', 'v0-old');
    expect(storage.isEligible(true, false)).toBe(true);
  });

  it('isEligible: false when dismissed recently (cooldown)', () => {
    storage.markDismissed();
    expect(storage.isEligible(true, false)).toBe(false);
  });
});

describe('OnboardingFlow', () => {
  let storage: OnboardingStorage;

  beforeEach(() => {
    localStorage.clear();
    storage = new OnboardingStorage();
  });

  it('starts at step 0 with 5 steps', () => {
    const flow = new OnboardingFlow(storage);
    const state = flow.getState();
    expect(state.currentStepIndex).toBe(0);
    expect(state.steps.length).toBe(5);
    expect(state.completed).toBe(false);
    expect(state.aborted).toBe(false);
  });

  it('completeCurrentStep advances to next step', () => {
    const flow = new OnboardingFlow(storage);
    flow.completeCurrentStep();
    expect(flow.getState().currentStepIndex).toBe(1);
    expect(flow.getState().steps[0].completed).toBe(true);
  });

  it('completing all steps marks flow as completed and persists', () => {
    const flow = new OnboardingFlow(storage);
    for (let i = 0; i < 5; i++) flow.completeCurrentStep();
    expect(flow.getState().completed).toBe(true);
    expect(storage.read().completed).toBe(true);
    expect(storage.read().version).toBe(CURRENT_VERSION);
  });

  it('abort sets aborted flag and getCurrentStep returns null', () => {
    const flow = new OnboardingFlow(storage);
    flow.abort();
    expect(flow.getState().aborted).toBe(true);
    expect(flow.getCurrentStep()).toBeNull();
  });

  it('abort persists dismiss timestamp', () => {
    const flow = new OnboardingFlow(storage);
    flow.abort();
    expect(storage.read().dismissedAt).toBeGreaterThan(0);
  });

  it('setMidiConnected auto-completes connection step', () => {
    const flow = new OnboardingFlow(storage);
    expect(flow.getCurrentStep()?.id).toBe('midi-connection');
    flow.setMidiConnected(true);
    expect(flow.getState().currentStepIndex).toBe(1);
  });

  it('onMidiNote completes first-notes step on any note', () => {
    const flow = new OnboardingFlow(storage);
    flow.completeCurrentStep(); // skip connection
    expect(flow.getCurrentStep()?.id).toBe('first-notes');
    flow.onMidiNote(60);
    expect(flow.getState().currentStepIndex).toBe(2);
  });

  it('simple-sequence requires notes in order', () => {
    const flow = new OnboardingFlow(storage);
    flow.completeCurrentStep(); // midi-connection
    flow.completeCurrentStep(); // first-notes
    expect(flow.getCurrentStep()?.id).toBe('simple-sequence');

    flow.onMidiNote(62); // D4 — wrong order, should not advance
    expect(flow.getCurrentStep()?.id).toBe('simple-sequence');

    flow.onMidiNote(60); // C4 — correct
    flow.onMidiNote(62); // D4 — correct
    flow.onMidiNote(64); // E4 — completes
    expect(flow.getState().currentStepIndex).toBe(3);
  });

  it('subscribe notifies on state change', () => {
    const flow = new OnboardingFlow(storage);
    const states: OnboardingFlow extends { getState(): infer S } ? S[] : never[] = [];
    flow.subscribe((s) => states.push(s));
    flow.completeCurrentStep();
    expect(states.length).toBe(1);
  });

  it('reset clears completion and restores initial state', () => {
    const flow = new OnboardingFlow(storage);
    for (let i = 0; i < 5; i++) flow.completeCurrentStep();
    expect(storage.read().completed).toBe(true);
    flow.reset();
    expect(storage.read().completed).toBe(false);
    expect(flow.getState().currentStepIndex).toBe(0);
  });

  // ── Anti-regressão ──

  /**
   * ANTI-REGRESSÃO: completar o onboarding deve persistir em localStorage com versão.
   * Se alguém remover a chamada markCompleted(), este teste falha.
   */
  it('regression: completion persists to localStorage with version', () => {
    const flow = new OnboardingFlow(storage);
    for (let i = 0; i < 5; i++) flow.completeCurrentStep();
    expect(localStorage.getItem('midi_onboarding_completed')).toBe('true');
    expect(localStorage.getItem('midi_onboarding_version')).toBe(CURRENT_VERSION);
  });

  /**
   * ANTI-REGRESSÃO: abortar o onboarding NÃO marca como completed,
   * mas persiste dismiss timestamp para cooldown.
   */
  it('regression: abort does not mark as completed but persists dismiss', () => {
    const flow = new OnboardingFlow(storage);
    flow.abort();
    expect(flow.getState().completed).toBe(false);
    expect(localStorage.getItem('midi_onboarding_completed')).toBeNull();
    expect(localStorage.getItem('midi_onboarding_dismissed_at')).not.toBeNull();
  });

  /**
   * ANTI-REGRESSÃO: flag OFF deve significar zero side effects.
   * isEligible deve ser false independente do estado do storage.
   */
  it('regression: flag OFF means zero eligibility regardless of storage state', () => {
    expect(OnboardingFlow.isEligible(false, false, storage)).toBe(false);
    storage.clear();
    expect(OnboardingFlow.isEligible(false, false, storage)).toBe(false);
  });
});
