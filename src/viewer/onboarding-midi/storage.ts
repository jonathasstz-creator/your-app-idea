/**
 * MIDI Onboarding — Storage Layer
 *
 * Handles persistence of onboarding state: completion, version, dismiss cooldown.
 * Decoupled from OnboardingFlow for testability and reuse.
 */

const KEYS = {
  completed: 'midi_onboarding_completed',
  version: 'midi_onboarding_version',
  lastSeenAt: 'midi_onboarding_last_seen_at',
  dismissedAt: 'midi_onboarding_dismissed_at',
} as const;

/** Current onboarding version — bump to force re-onboarding */
export const CURRENT_VERSION = 'v1';

/** Cooldown after dismiss before showing again (ms). 0 = never show again after dismiss. */
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface OnboardingStorageState {
  completed: boolean;
  version: string | null;
  lastSeenAt: number | null;
  dismissedAt: number | null;
}

export class OnboardingStorage {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage) {}

  read(): OnboardingStorageState {
    return {
      completed: this.storage.getItem(KEYS.completed) === 'true',
      version: this.storage.getItem(KEYS.version),
      lastSeenAt: this.safeParseTimestamp(this.storage.getItem(KEYS.lastSeenAt)),
      dismissedAt: this.safeParseTimestamp(this.storage.getItem(KEYS.dismissedAt)),
    };
  }

  /** Mark onboarding as completed with current version */
  markCompleted(): void {
    try {
      this.storage.setItem(KEYS.completed, 'true');
      this.storage.setItem(KEYS.version, CURRENT_VERSION);
      this.storage.removeItem(KEYS.dismissedAt);
    } catch {
      // Storage full — non-critical
    }
  }

  /** Mark onboarding as dismissed (skip) with timestamp */
  markDismissed(): void {
    try {
      this.storage.setItem(KEYS.dismissedAt, String(Date.now()));
    } catch {
      // non-critical
    }
  }

  /** Update last seen timestamp */
  touchLastSeen(): void {
    try {
      this.storage.setItem(KEYS.lastSeenAt, String(Date.now()));
    } catch {
      // non-critical
    }
  }

  /** Check if user is eligible to see onboarding */
  isEligible(flagEnabled: boolean, hasProgress: boolean): boolean {
    if (!flagEnabled) return false;
    if (hasProgress) return false;

    const state = this.read();

    // Completed current version — skip
    if (state.completed && state.version === CURRENT_VERSION) return false;

    // Completed old version — show again (re-onboarding)
    if (state.completed && state.version !== CURRENT_VERSION) return true;

    // Dismissed recently — respect cooldown
    if (state.dismissedAt) {
      const elapsed = Date.now() - state.dismissedAt;
      if (elapsed < DISMISS_COOLDOWN_MS) return false;
    }

    return true;
  }

  /** Reset all onboarding state (debug/testing) */
  clear(): void {
    for (const key of Object.values(KEYS)) {
      this.storage.removeItem(key);
    }
  }

  private safeParseTimestamp(raw: string | null): number | null {
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }
}
