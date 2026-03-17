/**
 * TDD: MIDI Onboarding — OnboardingFlow
 *
 * Tests for the pure onboarding state machine.
 * Written per project TDD policy: tests before integration.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { OnboardingFlow } from '../onboarding-midi/OnboardingFlow';
import { ONBOARDING_CONFIG } from '../onboarding-midi/types';

describe('OnboardingFlow', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ── Static checks ──

  it('isCompleted returns false when no data', () => {
    expect(OnboardingFlow.isCompleted()).toBe(false);
  });

  it('isCompleted returns true when key is set', () => {
    localStorage.setItem(ONBOARDING_CONFIG.completionKey, 'true');
    expect(OnboardingFlow.isCompleted()).toBe(true);
  });

  it('shouldShow: true when flag ON + not completed + no progress', () => {
    expect(OnboardingFlow.shouldShow(true, false)).toBe(true);
  });

  it('shouldShow: false when flag OFF', () => {
    expect(OnboardingFlow.shouldShow(false, false)).toBe(false);
  });

  it('shouldShow: false when already completed', () => {
    localStorage.setItem(ONBOARDING_CONFIG.completionKey, 'true');
    expect(OnboardingFlow.shouldShow(true, false)).toBe(false);
  });

  it('shouldShow: false when user has progress', () => {
    expect(OnboardingFlow.shouldShow(true, true)).toBe(false);
  });

  // ── Flow lifecycle ──

  it('starts at step 0 with 5 steps', () => {
    const flow = new OnboardingFlow();
    const state = flow.getState();
    expect(state.currentStepIndex).toBe(0);
    expect(state.steps.length).toBe(5);
    expect(state.completed).toBe(false);
    expect(state.aborted).toBe(false);
  });

  it('completeCurrentStep advances to next step', () => {
    const flow = new OnboardingFlow();
    flow.completeCurrentStep();
    expect(flow.getState().currentStepIndex).toBe(1);
    expect(flow.getState().steps[0].completed).toBe(true);
  });

  it('completing all steps marks flow as completed', () => {
    const flow = new OnboardingFlow();
    for (let i = 0; i < 5; i++) flow.completeCurrentStep();
    expect(flow.getState().completed).toBe(true);
    expect(OnboardingFlow.isCompleted()).toBe(true);
  });

  it('abort sets aborted flag and getCurrentStep returns null', () => {
    const flow = new OnboardingFlow();
    flow.abort();
    expect(flow.getState().aborted).toBe(true);
    expect(flow.getCurrentStep()).toBeNull();
  });

  it('setMidiConnected auto-completes connection step', () => {
    const flow = new OnboardingFlow();
    expect(flow.getCurrentStep()?.id).toBe('midi-connection');
    flow.setMidiConnected(true);
    expect(flow.getState().currentStepIndex).toBe(1);
    expect(flow.getState().steps[0].completed).toBe(true);
  });

  it('onMidiNote completes first-notes step on any note', () => {
    const flow = new OnboardingFlow();
    flow.completeCurrentStep(); // skip connection step
    expect(flow.getCurrentStep()?.id).toBe('first-notes');
    flow.onMidiNote(60); // C4
    expect(flow.getState().currentStepIndex).toBe(2);
  });

  it('subscribe notifies on state change', () => {
    const flow = new OnboardingFlow();
    const states: any[] = [];
    flow.subscribe((s) => states.push(s));
    flow.completeCurrentStep();
    expect(states.length).toBe(1);
    expect(states[0].currentStepIndex).toBe(1);
  });

  it('reset clears completion and restores initial state', () => {
    const flow = new OnboardingFlow();
    for (let i = 0; i < 5; i++) flow.completeCurrentStep();
    expect(OnboardingFlow.isCompleted()).toBe(true);
    flow.reset();
    expect(OnboardingFlow.isCompleted()).toBe(false);
    expect(flow.getState().currentStepIndex).toBe(0);
    expect(flow.getState().completed).toBe(false);
  });

  // ── Anti-regressão ──

  /**
   * ANTI-REGRESSÃO: completar o onboarding deve persistir em localStorage.
   * Se alguém remover a chamada de persistCompletion, este teste falha.
   */
  it('regression: completion persists to localStorage', () => {
    const flow = new OnboardingFlow();
    for (let i = 0; i < 5; i++) flow.completeCurrentStep();
    expect(localStorage.getItem(ONBOARDING_CONFIG.completionKey)).toBe('true');
  });

  /**
   * ANTI-REGRESSÃO: abortar o onboarding NÃO deve marcar como completed.
   * Garante que abort e complete são estados distintos.
   */
  it('regression: abort does not mark as completed', () => {
    const flow = new OnboardingFlow();
    flow.abort();
    expect(flow.getState().completed).toBe(false);
    expect(localStorage.getItem(ONBOARDING_CONFIG.completionKey)).toBeNull();
  });
});
