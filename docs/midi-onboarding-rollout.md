# MIDI Onboarding — Rollout & Rollback Plan

> Last updated: 2026-03-17

## Overview

The MIDI Onboarding module guides new users through keyboard connection and first notes.
Protected by feature flag `enableMidiOnboarding` (default: `false`).

## Module Location

```
src/viewer/onboarding-midi/
├── types.ts                  # Types, config, default steps
├── storage.ts                # Persistence: completion, version, dismiss cooldown
├── feature-flag.ts           # Flag integration with existing system
├── analytics.ts              # Event instrumentation
├── OnboardingFlow.ts         # Pure state machine (no DOM)
├── MidiOnboardingController.ts  # Bridge: flow ↔ WebMidiService ↔ UI
├── MidiOnboardingOverlay.tsx # React overlay component
├── steps/                    # Individual step components
│   ├── MidiConnectionStep.tsx
│   ├── FirstNotesStep.tsx
│   ├── ProgressIntroStep.tsx
│   └── FinishStep.tsx
└── index.ts                  # Barrel export
```

## Feature Flag

| Flag | Default | Type |
|------|---------|------|
| `enableMidiOnboarding` | `false` | boolean |

Follows existing precedence: default → localStorage → remote → runtime.

### Runtime toggle (dev)
```js
window.__flags.set('enableMidiOnboarding', true, 'runtime')
```

## Eligibility Criteria

User sees onboarding when ALL conditions are met:
1. `enableMidiOnboarding === true`
2. No existing progress (no `hs_*` or `sc_*` keys in localStorage)
3. `midi_onboarding_completed !== true` for current version
4. Not dismissed within cooldown period (7 days)

## Rollout Plan

| Phase | Scope | Duration | Exit Criteria |
|-------|-------|----------|--------------|
| 1 | Dev/QA only (runtime flag) | 1 week | No crashes, flow completes, analytics fires |
| 2 | 10% remote rollout | 1 week | Completion rate > 60%, no D1 retention drop |
| 3 | 50% remote rollout | 1 week | Stable metrics, support tickets within normal range |
| 4 | 100% (default → true) | Permanent | KPIs met |

## Rollback

### Kill Switch
Set `enableMidiOnboarding=false` via remote config. Effect is immediate:
- No new onboarding sessions start
- In-progress sessions: user can finish or abort (no force-close)
- Zero side effects when OFF: no listeners, no renders, no state changes

### Emergency Rollback
1. Remote: push `enableMidiOnboarding: false` to remote provider
2. The flag system's `subscribe` mechanism propagates the change immediately
3. No code deploy needed

### Version Bump
To force re-onboarding for users who completed an old version:
1. Change `CURRENT_VERSION` in `storage.ts` (e.g., `'v1'` → `'v2'`)
2. Users with `midi_onboarding_version !== CURRENT_VERSION` become eligible again

## Persistence Keys

| Key | Purpose |
|-----|---------|
| `midi_onboarding_completed` | `'true'` when all steps done |
| `midi_onboarding_version` | Version string (e.g., `'v1'`) |
| `midi_onboarding_last_seen_at` | Timestamp of last onboarding start |
| `midi_onboarding_dismissed_at` | Timestamp of skip/abort (cooldown) |

## Analytics Events

| Event | When |
|-------|------|
| `onboarding_midi_started` | Flow begins |
| `onboarding_midi_step_viewed` | Each step shown |
| `onboarding_midi_step_completed` | Each step completed |
| `onboarding_midi_midi_connected` | MIDI device detected |
| `onboarding_midi_first_note_hit` | First note played |
| `onboarding_midi_completed` | All steps done |
| `onboarding_midi_skipped` | User skips step or aborts |
| `onboarding_midi_failed` | Unexpected error in flow |

## KPIs

| Metric | Target |
|--------|--------|
| `first_lesson_completed` (D0) | +15% |
| D1 retention | +10% |
| `lesson_started` (existing users) | No regression |
| Onboarding completion rate | > 60% |
| Avg. time to complete | < 3 min |

## Risks

| Risk | Mitigation |
|------|-----------|
| MIDI not supported in browser | Step 1 shows "not supported" message, allows skip |
| User has no MIDI device | All MIDI steps are skippable |
| Storage full | All `setItem` calls wrapped in try/catch |
| Flow error crashes app | Controller catch-all with fallback to Hub |
| Analytics breaks onboarding | Analytics emitter never throws |

## Testing

```bash
npx vitest run src/viewer/__tests__/midi-onboarding.test.ts
```

Coverage: storage eligibility, flow lifecycle, sequence ordering, persistence, dismiss cooldown, version re-onboarding, anti-regression.
