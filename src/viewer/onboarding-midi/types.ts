/**
 * MIDI Onboarding — Types
 *
 * All types for the onboarding flow. Decoupled from engine internals.
 */

export type OnboardingStepId =
  | 'midi-connection'
  | 'first-notes'
  | 'simple-sequence'
  | 'progress-intro'
  | 'growth-mindset';

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  description: string;
  /** Whether this step requires MIDI input to advance */
  requiresMidi: boolean;
  /** Optional: specific MIDI notes the user must play */
  targetNotes?: number[];
  /** Whether step was completed */
  completed: boolean;
}

export interface OnboardingState {
  currentStepIndex: number;
  steps: OnboardingStep[];
  midiConnected: boolean;
  aborted: boolean;
  completed: boolean;
  startedAt: number;
  completedAt?: number;
}

export interface OnboardingConfig {
  /** localStorage key for completion persistence */
  completionKey: string;
  /** localStorage key for state persistence (resume) */
  stateKey: string;
  /** Version for forward-compatible migrations */
  version: number;
}

export const ONBOARDING_CONFIG: OnboardingConfig = {
  completionKey: 'midi_onboarding_completed',
  stateKey: 'midi_onboarding_state',
  version: 1,
};

export const DEFAULT_STEPS: OnboardingStep[] = [
  {
    id: 'midi-connection',
    title: 'Conecte seu teclado',
    description: 'Conecte um teclado MIDI via USB e permita o acesso no navegador.',
    requiresMidi: false,
    completed: false,
  },
  {
    id: 'first-notes',
    title: 'Toque sua primeira nota',
    description: 'Pressione qualquer tecla no seu teclado MIDI.',
    requiresMidi: true,
    completed: false,
  },
  {
    id: 'simple-sequence',
    title: 'Toque Dó-Ré-Mi',
    description: 'Toque as notas C4, D4 e E4 em sequência.',
    requiresMidi: true,
    targetNotes: [60, 62, 64], // C4, D4, E4
    completed: false,
  },
  {
    id: 'progress-intro',
    title: 'Seu progresso',
    description: 'Veja como o app rastreia seu score e streak!',
    requiresMidi: false,
    completed: false,
  },
  {
    id: 'growth-mindset',
    title: 'Pronto para evoluir!',
    description: 'Seu primeiro capítulo está desbloqueado. Boa prática! 🎹',
    requiresMidi: false,
    completed: false,
  },
];
