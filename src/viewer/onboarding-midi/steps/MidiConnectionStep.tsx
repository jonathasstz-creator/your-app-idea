import React from 'react';
import type { OnboardingStep } from '../types';

interface MidiConnectionStepProps {
  step: OnboardingStep;
  midiConnected: boolean;
}

export const MidiConnectionStep: React.FC<MidiConnectionStepProps> = ({ step, midiConnected }) => (
  <div className="onboarding-step-content">
    <div className="onboarding-icon">🔌</div>
    <h2 className="onboarding-title">{step.title}</h2>
    <p className="onboarding-description">{step.description}</p>
    <div className="onboarding-midi-status">
      <div className={`midi-status-indicator ${midiConnected ? 'connected' : 'disconnected'}`} />
      <span>{midiConnected ? 'Teclado conectado!' : 'Aguardando conexão...'}</span>
    </div>
    {midiConnected && (
      <p style={{ color: 'var(--success-neon)', fontSize: '13px', marginTop: '8px' }}>
        ✓ Conexão detectada! Avançando...
      </p>
    )}
  </div>
);
