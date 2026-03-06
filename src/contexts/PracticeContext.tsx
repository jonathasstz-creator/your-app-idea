import React, { createContext, useContext, useState } from 'react';
import { PracticeMode, StateFrameV1 } from '../types/practice.types';

interface PracticeContextValue {
  sessionId: string | null;
  mode: PracticeMode;
  state: StateFrameV1 | null;
  setState: (s: StateFrameV1 | null) => void;
  setSession: (id: string | null) => void;
  setMode: (m: PracticeMode) => void;
}

const PracticeContext = createContext<PracticeContextValue | undefined>(undefined);

export const PracticeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<PracticeMode>('WAIT');
  const [state, setState] = useState<StateFrameV1 | null>(null);

  return (
    <PracticeContext.Provider value={{ sessionId, mode, state, setSession: setSessionId, setMode, setState }}>
      {children}
    </PracticeContext.Provider>
  );
};

export function usePracticeContext(): PracticeContextValue {
  const ctx = useContext(PracticeContext);
  if (!ctx) throw new Error('usePracticeContext must be used inside PracticeProvider');
  return ctx;
}
