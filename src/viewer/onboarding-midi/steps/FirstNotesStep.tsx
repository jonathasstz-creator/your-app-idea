import React from 'react';
import type { OnboardingStep } from '../types';

interface FirstNotesStepProps {
  step: OnboardingStep;
  onSkip: () => void;
}

export const FirstNotesStep: React.FC<FirstNotesStepProps> = ({ step, onSkip }) => (
  <div className="onboarding-step-content">
    <div className="onboarding-icon">🎵</div>
    <h2 className="onboarding-title">{step.title}</h2>
    <p className="onboarding-description">{step.description}</p>
    <div className="onboarding-waiting">
      <div className="pulse-ring" />
      <span>Toque qualquer tecla...</span>
    </div>
    <button className="onboarding-skip-step-btn" onClick={onSkip} type="button">
      Pular este passo
    </button>
  </div>
);
