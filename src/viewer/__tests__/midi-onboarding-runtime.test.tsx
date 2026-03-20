import { beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react-dom/test-utils';
import {
  createMidiOnboardingRuntime,
  hasAnyStoredProgress,
  shouldShowMidiOnboarding,
} from '../onboarding-midi/runtime';

function createMockMidiService() {
  let noteListenerCount = 0;
  let stateListenerCount = 0;

  return {
    get noteListenerCount() {
      return noteListenerCount;
    },
    get stateListenerCount() {
      return stateListenerCount;
    },
    onNoteEvent() {
      noteListenerCount += 1;
      return () => {
        noteListenerCount -= 1;
      };
    },
    onStateChange() {
      stateListenerCount += 1;
      return () => {
        stateListenerCount -= 1;
      };
    },
  };
}

describe('midi onboarding runtime', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('detects saved progress from hs_/sc_ keys', () => {
    expect(hasAnyStoredProgress()).toBe(false);

    localStorage.setItem('sc_lesson_1_1_wait', '1');
    expect(hasAnyStoredProgress()).toBe(true);
  });

  it('only shows onboarding when flag is on and there is no progress', () => {
    expect(shouldShowMidiOnboarding(false)).toBe(false);
    expect(shouldShowMidiOnboarding(true)).toBe(true);

    localStorage.setItem('hs_lesson_2_2_wait', '80');
    expect(shouldShowMidiOnboarding(true)).toBe(false);
  });

  it('renders overlay and registers MIDI listeners when eligible', () => {
    const midi = createMockMidiService();
    const runtime = createMidiOnboardingRuntime({
      midiService: midi as any,
      isEnabled: () => true,
      onFlagChange: () => () => {},
    });

    act(() => {
      runtime.checkAndShow();
    });

    expect(document.querySelector('.onboarding-overlay')).not.toBeNull();
    expect(midi.noteListenerCount).toBe(1);
    expect(midi.stateListenerCount).toBe(1);

    act(() => {
      runtime.destroy();
    });
  });

  it('does not render overlay when user already has progress', () => {
    localStorage.setItem('sc_lesson_3_3_wait', '2');

    const runtime = createMidiOnboardingRuntime({
      midiService: createMockMidiService() as any,
      isEnabled: () => true,
      onFlagChange: () => () => {},
    });

    act(() => {
      runtime.checkAndShow();
    });

    expect(document.querySelector('.onboarding-overlay')).toBeNull();

    act(() => {
      runtime.destroy();
    });
  });

  it('removes overlay and listeners on destroy', () => {
    const midi = createMockMidiService();
    const runtime = createMidiOnboardingRuntime({
      midiService: midi as any,
      isEnabled: () => true,
      onFlagChange: () => () => {},
    });

    act(() => {
      runtime.checkAndShow();
      runtime.destroy();
    });

    expect(document.querySelector('.onboarding-overlay')).toBeNull();
    expect(document.getElementById('midi-onboarding-root')).toBeNull();
    expect(midi.noteListenerCount).toBe(0);
    expect(midi.stateListenerCount).toBe(0);
  });
});
