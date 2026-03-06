import React from 'react';
import { DifficultNotes } from '../../types/analytics.types';

export const StatsCard: React.FC<{ difficult: DifficultNotes[] }> = ({ difficult }) => (
  <div className="p-4 border border-slate-800 rounded-xl bg-slate-900/40">
    <h4 className="font-semibold mb-2">Notas mais difíceis</h4>
    <ul className="space-y-1 text-sm text-slate-300">
      {difficult.map((n) => (
        <li key={n.note} className="flex justify-between">
          <span>{n.note}</span>
          <span className="text-slate-400">{(n.miss_rate * 100).toFixed(1)}% · {n.total_attempts} tentativas</span>
        </li>
      ))}
    </ul>
  </div>
);
