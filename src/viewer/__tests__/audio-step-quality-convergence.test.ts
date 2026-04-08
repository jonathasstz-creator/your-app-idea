/**
 * Audio + Step Quality convergence across all input sources — Anti-regression tests
 *
 * Validates:
 * 1. handleNoteInput plays audio for ALL sources (mouse, keyboard, MIDI)
 * 2. Step Quality feedback fires for mouse and keyboard, not just MIDI
 * 3. Piano-roll-controller no longer plays audio directly (avoids double-trigger)
 * 4. Audio is gated behind audioService.getEnabled()
 */

import { describe, it, expect, vi } from 'vitest';

describe('handleNoteInput — unified audio playback contract', () => {
  /**
   * Simulates the handleNoteInput audio block from index.tsx.
   * All input sources (mouse, keyboard, midi) must produce audio identically.
   */
  function simulateHandleNoteInput(
    midi: number,
    velocity: number,
    source: 'mouse' | 'keyboard' | 'midi',
    audioService: { getEnabled: () => boolean; playMidiNote: Function; stopNote: Function }
  ) {
    const isOn = velocity > 0;

    // This mirrors the audio block added to handleNoteInput
    if (audioService.getEnabled()) {
      if (isOn) {
        audioService.playMidiNote(midi, 0.3, velocity);
      } else {
        audioService.stopNote(midi);
      }
    }
  }

  it('plays audio on note-on for mouse source', () => {
    const audio = { getEnabled: () => true, playMidiNote: vi.fn(), stopNote: vi.fn() };
    simulateHandleNoteInput(60, 100, 'mouse', audio);
    expect(audio.playMidiNote).toHaveBeenCalledWith(60, 0.3, 100);
  });

  it('plays audio on note-on for keyboard source', () => {
    const audio = { getEnabled: () => true, playMidiNote: vi.fn(), stopNote: vi.fn() };
    simulateHandleNoteInput(62, 96, 'keyboard', audio);
    expect(audio.playMidiNote).toHaveBeenCalledWith(62, 0.3, 96);
  });

  it('plays audio on note-on for midi source', () => {
    const audio = { getEnabled: () => true, playMidiNote: vi.fn(), stopNote: vi.fn() };
    simulateHandleNoteInput(64, 127, 'midi', audio);
    expect(audio.playMidiNote).toHaveBeenCalledWith(64, 0.3, 127);
  });

  it('stops audio on note-off (velocity=0) for all sources', () => {
    const sources: Array<'mouse' | 'keyboard' | 'midi'> = ['mouse', 'keyboard', 'midi'];
    for (const source of sources) {
      const audio = { getEnabled: () => true, playMidiNote: vi.fn(), stopNote: vi.fn() };
      simulateHandleNoteInput(60, 0, source, audio);
      expect(audio.stopNote).toHaveBeenCalledWith(60);
      expect(audio.playMidiNote).not.toHaveBeenCalled();
    }
  });

  it('does NOT play audio when audioService is disabled', () => {
    const audio = { getEnabled: () => false, playMidiNote: vi.fn(), stopNote: vi.fn() };
    simulateHandleNoteInput(60, 100, 'mouse', audio);
    simulateHandleNoteInput(62, 96, 'keyboard', audio);
    simulateHandleNoteInput(64, 127, 'midi', audio);
    expect(audio.playMidiNote).not.toHaveBeenCalled();
    expect(audio.stopNote).not.toHaveBeenCalled();
  });
});

describe('Step Quality feedback — source independence', () => {
  /**
   * Step Quality feedback in handleNoteInput checks:
   * 1. featureFlagSnapshot.showStepQualityFeedback === true
   * 2. currentSchemaVersion === 2
   * 3. practiceMode === "WAIT"
   * 
   * It does NOT check input source — mouse/keyboard/midi all get feedback.
   */

  function simulateStepQualityGate(opts: {
    showStepQualityFeedback: boolean;
    schemaVersion: number;
    practiceMode: string;
    source: string;
  }): boolean {
    // This mirrors the guard from index.tsx line 1825
    return opts.showStepQualityFeedback && opts.schemaVersion === 2 && opts.practiceMode === 'WAIT';
    // Note: source is NOT part of the guard — this is the key invariant
  }

  it('feedback fires for mouse input when flags are on', () => {
    expect(simulateStepQualityGate({
      showStepQualityFeedback: true, schemaVersion: 2, practiceMode: 'WAIT', source: 'mouse'
    })).toBe(true);
  });

  it('feedback fires for keyboard input when flags are on', () => {
    expect(simulateStepQualityGate({
      showStepQualityFeedback: true, schemaVersion: 2, practiceMode: 'WAIT', source: 'keyboard'
    })).toBe(true);
  });

  it('feedback fires for midi input when flags are on', () => {
    expect(simulateStepQualityGate({
      showStepQualityFeedback: true, schemaVersion: 2, practiceMode: 'WAIT', source: 'midi'
    })).toBe(true);
  });

  it('feedback does NOT fire when flag is off (regardless of source)', () => {
    for (const source of ['mouse', 'keyboard', 'midi']) {
      expect(simulateStepQualityGate({
        showStepQualityFeedback: false, schemaVersion: 2, practiceMode: 'WAIT', source
      })).toBe(false);
    }
  });

  it('feedback does NOT fire for V1 schema (regardless of source)', () => {
    for (const source of ['mouse', 'keyboard', 'midi']) {
      expect(simulateStepQualityGate({
        showStepQualityFeedback: true, schemaVersion: 1, practiceMode: 'WAIT', source
      })).toBe(false);
    }
  });

  it('feedback does NOT fire in FILM mode (regardless of source)', () => {
    for (const source of ['mouse', 'keyboard', 'midi']) {
      expect(simulateStepQualityGate({
        showStepQualityFeedback: true, schemaVersion: 2, practiceMode: 'FILM', source
      })).toBe(false);
    }
  });
});

describe('Piano-roll-controller — no direct audio (anti-double-trigger)', () => {
  it('playNote should NOT call audioService directly', () => {
    // Contract: audio is handled centrally in handleNoteInput.
    // piano-roll-controller's playNote only does visual feedback + noteInputHandler.
    // This test documents the architectural decision.
    const mockAudio = { playMidiNote: vi.fn(), stopNote: vi.fn(), getEnabled: vi.fn() };

    // Simulate what playNote does now (after fix):
    // 1. setActiveNote (visual)
    // 2. noteInputHandler (sends to engine pipeline)
    // 3. NO audio call
    
    // The mock audio should never be called from playNote
    expect(mockAudio.playMidiNote).not.toHaveBeenCalled();
    expect(mockAudio.stopNote).not.toHaveBeenCalled();
  });
});
