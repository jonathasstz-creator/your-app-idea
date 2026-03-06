import React from 'react';
import { Module } from '../../types/lesson.types';

export const ModuleCard: React.FC<{ module: Module; onSelect: (id: string) => void }> = ({ module, onSelect }) => (
  <button onClick={() => onSelect(module.id)} className="w-full text-left p-4 bg-slate-900/60 border border-slate-800 rounded-xl hover:border-indigo-500 transition">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-xl">{module.icon}</span>
        <div>
          <h3 className="font-semibold">{module.name}</h3>
          <p className="text-xs text-slate-400">{module.description}</p>
        </div>
      </div>
      <span className="text-sm text-indigo-300">{module.progress_percent}%</span>
    </div>
  </button>
);
