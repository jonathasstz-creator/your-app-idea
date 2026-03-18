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
        { label: 'Score', description: 'Pontos por nota correta', icon: '🎯' },
        { label: 'Streak', description: 'Sequência de acertos', icon: '🔥' },
        { label: 'Precisão', description: '% de notas certas', icon: '✓' },
      ].map((stat) => (
        <div key={stat.label} style={{
          padding: '12px 16px',
          background: 'rgba(0,242,255,0.06)',
          border: '1px solid rgba(0,242,255,0.15)',
          borderRadius: '10px',
          textAlign: 'center',
          flex: '1',
        }}>
          <div style={{ fontSize: '20px' }}>{stat.icon}</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary-neon)', marginTop: '4px' }}>
            {stat.label}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--muted)', marginTop: '2px', lineHeight: '1.3' }}>
            {stat.description}
          </div>
        </div>
      ))}
    </div>

    <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '12px', textAlign: 'center' }}>
      Ao final de cada lição você verá seu desempenho e poderá tentar melhorar!
    </p>

    <button className="onboarding-continue-btn" onClick={onContinue} type="button">
      Continuar
    </button>
  </div>
);
