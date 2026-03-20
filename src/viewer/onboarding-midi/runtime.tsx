import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MidiOnboardingController } from './MidiOnboardingController';
import { MidiOnboardingOverlay } from './MidiOnboardingOverlay';
import { OnboardingStorage } from './storage';
import { isMidiOnboardingEnabled, onMidiOnboardingFlagChange } from './feature-flag';
import type { WebMidiService } from '../webmidi-service';

type OnboardingRuntimeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

type CreateMidiOnboardingRuntimeOptions = {
  midiService: WebMidiService;
  storage?: OnboardingRuntimeStorage;
  isEnabled?: () => boolean;
  onFlagChange?: (callback: (enabled: boolean) => void) => () => void;
};

const ROOT_ID = 'midi-onboarding-root';

export function hasAnyStoredProgress(
  storage: Pick<Storage, 'getItem' | 'key' | 'length'> = localStorage
): boolean {
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || (!key.startsWith('hs_') && !key.startsWith('sc_'))) continue;

    const raw = storage.getItem(key);
    const value = raw ? Number.parseInt(raw, 10) : 0;
    if (Number.isFinite(value) && value > 0) return true;
  }

  return false;
}

export function shouldShowMidiOnboarding(
  flagEnabled: boolean,
  storage: OnboardingRuntimeStorage = localStorage
): boolean {
  const hasProgress = hasAnyStoredProgress(storage);
  return MidiOnboardingController.isEligible(
    flagEnabled,
    hasProgress,
    new OnboardingStorage(storage)
  );
}

export function createMidiOnboardingRuntime({
  midiService,
  storage = localStorage,
  isEnabled = isMidiOnboardingEnabled,
  onFlagChange = onMidiOnboardingFlagChange,
}: CreateMidiOnboardingRuntimeOptions) {
  let root: Root | null = null;
  let controller: MidiOnboardingController | null = null;
  let mounted = false;

  const ensureRoot = (): Root => {
    if (root) return root;

    let container = document.getElementById(ROOT_ID);
    if (!container) {
      container = document.createElement('div');
      container.id = ROOT_ID;
      document.body.appendChild(container);
    }

    root = createRoot(container);
    return root;
  };

  const unmountOverlay = () => {
    controller?.destroy();
    controller = null;
    mounted = false;
    root?.render(null);
  };

  const mountOverlay = () => {
    if (mounted) return;
    if (!shouldShowMidiOnboarding(isEnabled(), storage)) return;

    controller = new MidiOnboardingController(new OnboardingStorage(storage));
    controller.attachMidi(midiService);
    controller.start();
    mounted = true;

    ensureRoot().render(
      <MidiOnboardingOverlay
        controller={controller}
        onComplete={unmountOverlay}
        onAbort={unmountOverlay}
      />
    );
  };

  const unsubscribeFlag = onFlagChange((enabled) => {
    if (!enabled) {
      unmountOverlay();
      return;
    }

    mountOverlay();
  });

  return {
    checkAndShow: mountOverlay,
    destroy: () => {
      unsubscribeFlag();
      unmountOverlay();
      root?.unmount();
      root = null;
      document.getElementById(ROOT_ID)?.remove();
    },
  };
}
