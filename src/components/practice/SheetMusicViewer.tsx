import React from 'react';

export const SheetMusicViewer: React.FC<{ xml?: string }> = ({ xml }) => (
  <div className="h-64 rounded-xl border border-slate-800 bg-slate-950/40 flex items-center justify-center text-slate-500">
    {xml ? 'Partitura (mock)' : 'Carregando partitura...'}
  </div>
);
