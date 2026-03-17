/**
 * MIDI Onboarding — React UI
 *
 * Full-screen onboarding overlay. Self-contained, no dependency on index.tsx state.
 * Renders the current step with appropriate UX.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { OnboardingState, OnboardingStep } from './types';
import type { MidiOnboardingController } from './MidiOnboardingController';

interface MidiOnboardingOverlayProps {
  controller: MidiOnboardingController;
  onComplete: () => void;
  onAbort: () => void;
}

export const MidiOnboardingOverlay: React.FC<MidiOnboardingOverlayProps> = ({
  controller,
  onComplete,
  onAbort,
}) => {
  const [state, setState] = useState<OnboardingState>(controller.getState());

  useEffect(() => {
    const unsub = controller.subscribe((next) => {
      setState(next);
      if (next.completed) onComplete();
      if (next.aborted) onAbort();
    });
    return unsub;
  }, [controller, onComplete, onAbort]);

  const currentStep = state.steps[state.currentStepIndex];
  const progress = ((state.currentStepIndex) / state.steps.length) * 100;

  if (state.completed || state.aborted) return null;

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-panel">
        {/* Header */}
        <div className="onboarding-header">
          <div className="onboarding-progress-bar">
            <div
              className="onboarding-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="onboarding-header-row">
            <span className="onboarding-step-counter">
              {state.currentStepIndex + 1} / {state.steps.length}
            </span>
            <button
              className="onboarding-skip-btn"
              onClick={() => controller.abort()}
              type="button"
            >
              Pular tutorial
            </button>
          </div>
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep?.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="onboarding-step"
          >
            <StepContent
              step={currentStep}
              midiConnected={state.midiConnected}
              onSkip={() => controller.skipStep()}
              onComplete={() => controller.completeStep()}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

/* ── Step Content Renderer ── */
function StepContent({
  step,
  midiConnected,
  onSkip,
  onComplete,
}: {
  step: OnboardingStep | undefined;
  midiConnected: boolean;
  onSkip: () => void;
  onComplete: () => void;
}) {
  if (!step) return null;

  const icons: Record<string, string> = {
    'midi-connection': '🔌',
    'first-notes': '🎵',
    'simple-sequence': '🎶',
    'progress-intro': '📊',
    'growth-mindset': '🚀',
  };

  return (
    <div className="onboarding-step-content">
      <div className="onboarding-icon">{icons[step.id] ?? '🎹'}</div>
      <h2 className="onboarding-title">{step.title}</h2>
      <p className="onboarding-description">{step.description}</p>

      {/* Connection step: show status */}
      {step.id === 'midi-connection' && (
        <div className="onboarding-midi-status">
          <div
            className={`midi-status-indicator ${midiConnected ? 'connected' : 'disconnected'}`}
          />
          <span>{midiConnected ? 'Teclado conectado!' : 'Aguardando conexão...'}</span>
        </div>
      )}

      {/* First notes / sequence: show waiting indicator */}
      {step.requiresMidi && step.id !== 'midi-connection' && (
        <div className="onboarding-waiting">
          <div className="pulse-ring" />
          <span>Toque no seu teclado...</span>
        </div>
      )}

      {/* Sequence step: show target notes */}
      {step.id === 'simple-sequence' && step.targetNotes && (
        <div className="onboarding-notes-target">
          {step.targetNotes.map((midi, i) => (
            <span key={i} className="target-note">
              {['C4', 'D4', 'E4'][i] ?? `Nota ${midi}`}
            </span>
          ))}
        </div>
      )}

      {/* Non-MIDI steps: show continue button */}
      {!step.requiresMidi && step.id !== 'midi-connection' && (
        <button
          className="onboarding-continue-btn"
          onClick={onComplete}
          type="button"
        >
          {step.id === 'growth-mindset' ? 'Começar a praticar! 🎹' : 'Continuar'}
        </button>
      )}

      {/* Skip option for MIDI steps */}
      {step.requiresMidi && (
        <button
          className="onboarding-skip-step-btn"
          onClick={onSkip}
          type="button"
        >
          Pular este passo
        </button>
      )}
    </div>
  );
}
