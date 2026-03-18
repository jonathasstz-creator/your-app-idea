/**
 * MIDI Onboarding — React UI Overlay
 *
 * Full-screen onboarding overlay. Self-contained, no dependency on index.tsx state.
 * Delegates rendering to individual step components.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { OnboardingState, OnboardingStep } from './types';
import type { MidiOnboardingController } from './MidiOnboardingController';
import { MidiConnectionStep } from './steps/MidiConnectionStep';
import { FirstNotesStep } from './steps/FirstNotesStep';
import { ProgressIntroStep } from './steps/ProgressIntroStep';
import { FinishStep } from './steps/FinishStep';

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
  // Progress: completed steps / total. Step 1 of 5 = 20%, last step = 100%.
  const progress = ((state.currentStepIndex + (currentStep?.completed ? 1 : 0)) / state.steps.length) * 100;

  if (state.completed || state.aborted) return null;

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-panel">
        {/* Header */}
        <div className="onboarding-header">
          <div className="onboarding-progress-bar">
            <div
              className="onboarding-progress-fill"
              style={{ width: `${Math.max(progress, 10)}%` }}
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
            {currentStep && (
              <StepRouter
                step={currentStep}
                midiConnected={state.midiConnected}
                onSkip={() => controller.skipStep()}
                onComplete={() => controller.completeStep()}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

/* ── Step Router ── */
function StepRouter({
  step,
  midiConnected,
  onSkip,
  onComplete,
}: {
  step: OnboardingStep;
  midiConnected: boolean;
  onSkip: () => void;
  onComplete: () => void;
}) {
  switch (step.id) {
    case 'midi-connection':
      return <MidiConnectionStep step={step} midiConnected={midiConnected} onSkip={onSkip} />;
    case 'first-notes':
      return <FirstNotesStep step={step} onSkip={onSkip} />;
    case 'simple-sequence':
      return (
        <div className="onboarding-step-content">
          <div className="onboarding-icon">🎶</div>
          <h2 className="onboarding-title">{step.title}</h2>
          <p className="onboarding-description">{step.description}</p>
          {step.targetNotes && (
            <div className="onboarding-notes-target">
              {step.targetNotes.map((midi, i) => (
                <span key={i} className="target-note">
                  {['C4', 'D4', 'E4'][i] ?? `Nota ${midi}`}
                </span>
              ))}
            </div>
          )}
          <div className="onboarding-waiting">
            <div className="pulse-ring" />
            <span>Toque as notas na ordem...</span>
          </div>
          <button className="onboarding-skip-step-btn" onClick={onSkip} type="button">
            Pular este passo
          </button>
        </div>
      );
    case 'progress-intro':
      return <ProgressIntroStep step={step} onContinue={onComplete} />;
    case 'growth-mindset':
      return <FinishStep step={step} onFinish={onComplete} />;
    default:
      return null;
  }
}
