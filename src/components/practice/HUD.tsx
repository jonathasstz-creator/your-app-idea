import React from 'react';
import { StateFrameV1 } from '../../types/practice.types';

export const HUD: React.FC<{ state: StateFrameV1 | null }> = ({ state }) => (
  <div className="grid grid-cols-4 gap-3 text-sm">
    <Metric label="Score" value={state?.score ?? 0} />
    <Metric label="Streak" value={state?.streak ?? 0} />
    <Metric label="Passo" value={`${state?.step ?? 0}/${state?.total_steps ?? 0}`} />
    <Metric label="Último" value={state?.last_result ?? '—'} />
  </div>
);

const Metric: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
    <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
    <p className="text-lg font-semibold">{value}</p>
  </div>
);
