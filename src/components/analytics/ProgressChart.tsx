import React from 'react';
import { ProgressData } from '../../types/analytics.types';

export const ProgressChart: React.FC<{ progress: ProgressData }> = ({ progress }) => (
  <div className="p-4 border border-slate-800 rounded-xl bg-slate-900/40">
    <h4 className="font-semibold mb-2">Tendência (últimos {progress.period})</h4>
    <div className="text-xs text-slate-400">Accuracy & Score (mock chart)</div>
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
      <ul className="space-y-1">
        {progress.accuracy_trend.slice(0, 5).map((p) => (
          <li key={p.date}>🎯 {p.date}: {(p.value * 100).toFixed(1)}%</li>
        ))}
      </ul>
      <ul className="space-y-1">
        {progress.score_trend.slice(0, 5).map((p) => (
          <li key={p.date}>🏆 {p.date}: {p.value.toFixed(0)}</li>
        ))}
      </ul>
    </div>
  </div>
);
