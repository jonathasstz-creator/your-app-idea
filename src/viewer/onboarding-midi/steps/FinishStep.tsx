import React from 'react';
import type { OnboardingStep } from '../types';

interface FinishStepProps {
  step: OnboardingStep;
  onFinish: () => void;
}

export const FinishStep: React.FC<FinishStepProps> = ({ step, onFinish }) => (
  <div className="onboarding-step-content">
    <div className="onboarding-icon">🚀</div>
    <h2 className="onboarding-title">{step.title}</h2>
    <p className="onboarding-description">{step.description}</p>

    <div style={{
      marginTop: '16px',
      padding: '14px 20px',
      background: 'linear-gradient(135deg, rgba(0,255,136,0.08) 0%, rgba(0,242,255,0.08) 100%)',
      border: '1px solid rgba(0,255,136,0.2)',
      borderRadius: '12px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '28px', marginBottom: '4px' }}>🎹</div>
      <p style={{ fontSize: '13px', color: 'var(--success-neon)', fontWeight: 600 }}>
        Seu primeiro capítulo está desbloqueado!
      </p>
    </div>

    <button className="onboarding-continue-btn" onClick={onFinish} type="button">
      Começar a praticar! 🎹
    </button>
  </div>
);
