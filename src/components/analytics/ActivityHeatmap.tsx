import React from 'react';
import { DailyActivity } from '../../types/analytics.types';

export const ActivityHeatmap: React.FC<{ days: DailyActivity[] }> = ({ days }) => (
  <div className="grid grid-cols-7 gap-1 text-[10px]">
    {days.map((d) => {
      const intensity = Math.min(1, d.practice_minutes / 40);
      const bg = `rgba(124,58,237,${0.15 + intensity * 0.6})`;
      return (
        <div key={d.date} className="w-10 h-10 flex items-center justify-center rounded" style={{ background: bg }}>
          {d.practice_minutes}m
        </div>
      );
    })}
  </div>
);
