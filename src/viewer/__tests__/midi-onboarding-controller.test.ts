/**
 * TDD: MIDI Onboarding — Controller + Lifecycle + Feature Flag
 *
 * Tests for MidiOnboardingController, WebMidiService unsubscribe,
 * feature flag integration, and lifecycle destroy/remount safety.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MidiOnboardingController } from '../onboarding-midi/MidiOnboardingController';
import { OnboardingStorage, CURRENT_VERSION } from '../onboarding-midi/storage';
import type { MidiNoteEvent, MidiServiceState } from '../webmidi-service';

/* ── Minimal WebMidiService mock with unsubscribe ── */
function createMockMidiService() {
  const noteCallbacks: Array<(e: MidiNoteEvent) => void> = [];
  const stateCallbacks: Array<(s: MidiServiceState) => void> = [];

  return {
    onNoteEvent(cb: (e: MidiNoteEvent) => void): () => void {
      noteCallbacks.push(cb);
      return () => {
        const idx = noteCallbacks.indexOf(cb);
        if (idx !== -1) noteCallbacks.splice(idx, 1);
      };
    },
    onStateChange(cb: (s: MidiServiceState) => void): () => void {
      stateCallbacks.push(cb);
      return () => {
        const idx = stateCallbacks.indexOf(cb);
        if (idx !== -1) stateCallbacks.splice(idx, 1);
      };
    },
    // Helpers for tests
    emitNote(midi: number, velocity = 100) {
      for (const cb of [...noteCallbacks]) {
        cb({ type: 'note_on', midi, velocity, timestamp: Date.now() });
      }
    },
    emitState(connected: boolean) {
      const state: MidiServiceState = {
        supported: true,
        accessGranted: true,
        ports: [],
        selectedPort: null,
        activePort: null,
        connected,
        error: null,
        pending: false,
      };
      for (const cb of [...stateCallbacks]) {
        cb(state);
      }
    },
    get noteListenerCount() { return noteCallbacks.length; },
    get stateListenerCount() { return stateCallbacks.length; },
  };
}

describe('MidiOnboardingController', () => {
  let storage: OnboardingStorage;

  beforeEach(() => {
    localStorage.clear();
    storage = new OnboardingStorage();
  });

  it('attachMidi registers listeners on WebMidiService', () => {
    const midi = createMockMidiService();
    const ctrl = new MidiOnboardingController(storage);
    ctrl.attachMidi(midi as any);

    expect(midi.noteListenerCount).toBe(1);
    expect(midi.stateListenerCount).toBe(1);
  });

  it('destroy removes all MIDI listeners', () => {
    const midi = createMockMidiService();
    const ctrl = new MidiOnboardingController(storage);
    ctrl.attachMidi(midi as any);

    expect(midi.noteListenerCount).toBe(1);
    ctrl.destroy();
    expect(midi.noteListenerCount).toBe(0);
    expect(midi.stateListenerCount).toBe(0);
  });

  it('MIDI note advances flow after attachMidi', () => {
    const midi = createMockMidiService();
    const ctrl = new MidiOnboardingController(storage);
    ctrl.attachMidi(midi as any);

    // Skip midi-connection step
    ctrl.completeStep();
    expect(ctrl.getCurrentStep()?.id).toBe('first-notes');

    // Emit note → should advance past first-notes
    midi.emitNote(60);
    expect(ctrl.getCurrentStep()?.id).toBe('simple-sequence');
  });

  it('MIDI state change auto-completes connection step', () => {
    const midi = createMockMidiService();
    const ctrl = new MidiOnboardingController(storage);
    ctrl.attachMidi(midi as any);

    expect(ctrl.getCurrentStep()?.id).toBe('midi-connection');
    midi.emitState(true);
    expect(ctrl.getCurrentStep()?.id).toBe('first-notes');
  });

  it('destroyed controller ignores MIDI events', () => {
    const midi = createMockMidiService();
    const ctrl = new MidiOnboardingController(storage);
    ctrl.attachMidi(midi as any);
    ctrl.destroy();

    // Events should not crash or advance
    midi.emitNote(60);
    midi.emitState(true);
    // No crash is the assertion — listeners were removed
    expect(midi.noteListenerCount).toBe(0);
  });

  /**
   * ANTI-REGRESSÃO: remount do controller não deve duplicar listeners.
   * Se alguém recriar controller sem destroy(), listeners se empilham.
   * Com destroy() correto, a contagem deve ser sempre 1.
   */
  it('regression: destroy + remount does not duplicate listeners', () => {
    const midi = createMockMidiService();

    const ctrl1 = new MidiOnboardingController(storage);
    ctrl1.attachMidi(midi as any);
    expect(midi.noteListenerCount).toBe(1);

    ctrl1.destroy();
    expect(midi.noteListenerCount).toBe(0);

    const ctrl2 = new MidiOnboardingController(storage);
    ctrl2.attachMidi(midi as any);
    expect(midi.noteListenerCount).toBe(1);

    ctrl2.destroy();
  });

  /**
   * ANTI-REGRESSÃO: destroy() é idempotente.
   * Chamar destroy() múltiplas vezes não deve crashar.
   */
  it('regression: destroy is idempotent', () => {
    const midi = createMockMidiService();
    const ctrl = new MidiOnboardingController(storage);
    ctrl.attachMidi(midi as any);

    ctrl.destroy();
    ctrl.destroy(); // second call
    ctrl.destroy(); // third call
    expect(midi.noteListenerCount).toBe(0);
  });
});

describe('MidiOnboardingController — eligibility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('isEligible returns false when flag is OFF', () => {
    expect(MidiOnboardingController.isEligible(false, false)).toBe(false);
  });

  it('isEligible returns true for new user with flag ON', () => {
    expect(MidiOnboardingController.isEligible(true, false)).toBe(true);
  });

  it('isEligible returns false when user has progress', () => {
    expect(MidiOnboardingController.isEligible(true, true)).toBe(false);
  });

  it('isEligible returns false after completion of current version', () => {
    const s = new OnboardingStorage();
    s.markCompleted();
    expect(s.isEligible(true, false)).toBe(false);
  });

  /**
   * ANTI-REGRESSÃO: flag OFF com qualquer estado de storage
   * deve SEMPRE retornar false. Zero side effects.
   */
  it('regression: flag OFF = zero eligibility regardless of storage state', () => {
    const s = new OnboardingStorage();
    expect(s.isEligible(false, false)).toBe(false);
    s.clear();
    expect(s.isEligible(false, false)).toBe(false);
    // Even with old version completed
    localStorage.setItem('midi_onboarding_completed', 'true');
    localStorage.setItem('midi_onboarding_version', 'v0-old');
    expect(s.isEligible(false, false)).toBe(false);
  });
});
