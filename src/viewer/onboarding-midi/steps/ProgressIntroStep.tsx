import React from 'react';
import type { OnboardingStep } from '../types';

interface ProgressIntroStepProps {
  step: OnboardingStep;
  onContinue: () => void;
}

export const ProgressIntroStep: React.FC<ProgressIntroStepProps> = ({ step, onContinue }) => (
  <div className="onboarding-step-content">
    <div className="onboarding-icon">📊</div>
    <h2 className="onboarding-title">{step.title}</h2>
    <p className="onboarding-description">{step.description}</p>

    <div style={{
      display: 'flex',
      gap: '16px',
      marginTop: '12px',
      justifyContent: 'center',
    }}>
      {[
        { label: 'Score', value: '850', icon: '🎯' },
        { label: 'Streak', value: '5x', icon: '🔥' },
        { label: 'Precisão', value: '92%', icon: '✓' },
      ].map((stat) => (
        <div key={stat.label} style={{
          padding: '12px 16px',
          background: 'rgba(0,242,255,0.06)',
          border: '1px solid rgba(0,242,255,0.15)',
          borderRadius: '10px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '20px' }}>{stat.icon}</div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary-neon)' }}>
            {stat.value}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px' }}>
            {stat.label}
          </div>
        </div>
      ))}
    </div>

    <button className="onboarding-continue-btn" onClick={onContinue} type="button">
      Continuar
    </button>
  </div>
);
