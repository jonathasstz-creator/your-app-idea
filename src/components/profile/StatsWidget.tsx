import React from 'react';
import { UserProfile } from '../../types/auth.types';

export const StatsWidget: React.FC<{ profile: UserProfile }> = ({ profile }) => {
  const stats = [
    { label: 'Horas de prática', value: profile.total_practice_hours.toFixed(1) },
    { label: 'Lições completas', value: profile.lessons_completed },
    { label: 'Streak atual', value: profile.current_streak },
    { label: 'Maior streak', value: profile.longest_streak },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {stats.map((s) => (
        <div key={s.label} className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
          <p className="text-xs text-slate-500 uppercase tracking-wide">{s.label}</p>
          <p className="text-xl font-semibold">{s.value}</p>
        </div>
      ))}
    </div>
  );
};
