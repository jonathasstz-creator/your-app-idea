import React from 'react';
import type { OnboardingStep } from '../types';

interface MidiConnectionStepProps {
  step: OnboardingStep;
  midiConnected: boolean;
  onSkip: () => void;
}

export const MidiConnectionStep: React.FC<MidiConnectionStepProps> = ({ step, midiConnected, onSkip }) => {
  const isSupported = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;

  return (
    <div className="onboarding-step-content">
      <div className="onboarding-icon">🔌</div>
      <h2 className="onboarding-title">{step.title}</h2>
      <p className="onboarding-description">{step.description}</p>

      {!isSupported ? (
        <div style={{
          padding: '12px 16px',
          background: 'rgba(255,100,100,0.08)',
          border: '1px solid rgba(255,100,100,0.2)',
          borderRadius: '10px',
          marginTop: '12px',
          textAlign: 'center',
        }}>
          <p style={{ fontSize: '13px', color: '#ff6464', fontWeight: 600 }}>
            ⚠️ Seu navegador não suporta MIDI.
          </p>
          <p style={{ fontSize: '12px', color: 'var(--muted)', marginTop: '4px' }}>
            Use Chrome, Edge ou Opera para conectar um teclado MIDI.
          </p>
        </div>
      ) : (
        <>
          <div className="onboarding-midi-status">
            <div className={`midi-status-indicator ${midiConnected ? 'connected' : 'disconnected'}`} />
            <span>{midiConnected ? 'Teclado conectado!' : 'Aguardando conexão...'}</span>
          </div>

          {!midiConnected && (
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px', textAlign: 'center' }}>
              Conecte um teclado MIDI via USB e permita o acesso quando o navegador solicitar.
            </p>
          )}

          {midiConnected && (
            <p style={{ color: 'var(--success-neon)', fontSize: '13px', marginTop: '8px' }}>
              ✓ Conexão detectada! Avançando...
            </p>
          )}
        </>
      )}

      <button className="onboarding-skip-step-btn" onClick={onSkip} type="button">
        {!isSupported ? 'Continuar sem MIDI' : 'Pular este passo'}
      </button>
    </div>
  );
};
