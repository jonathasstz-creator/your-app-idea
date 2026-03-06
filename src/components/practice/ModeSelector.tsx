import React from 'react';
import { PracticeMode } from '../../types/practice.types';

export const ModeSelector: React.FC<{ mode: PracticeMode; onChange: (m: PracticeMode) => void }> = ({ mode, onChange }) => {
  const modes: PracticeMode[] = ['WAIT', 'FILM', 'PLAIN'];
  return (
    <div className="flex gap-2">
      {modes.map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`px-3 py-1 rounded border ${mode === m ? 'border-indigo-500 text-white' : 'border-slate-700 text-slate-400'}`}
        >
          {m}
        </button>
      ))}
    </div>
  );
};
