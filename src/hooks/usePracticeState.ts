import { useEffect, useState } from 'react';
import { practiceService } from '../services/practice.service';
import { PracticeMode, StateFrameV1 } from '../types/practice.types';

export function usePracticeState(sessionId?: string) {
  const [state, setState] = useState<StateFrameV1 | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setState(practiceService.getState());
    }, 100);
    return () => clearInterval(interval);
  }, [sessionId]);

  return state;
}

export function useModeSwitcher() {
  const [mode, setMode] = useState<PracticeMode>('WAIT');
  const cycle = () => setMode(practiceService.cycleMode());
  return { mode, cycle };
}
