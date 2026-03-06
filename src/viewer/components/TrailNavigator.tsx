import React from 'react';
import type { Trail } from '../catalog/types';

interface TrailNavigatorProps {
  trails: Trail[];
  onSelectChapter: (chapterId: number) => void;
  onClose: () => void;
}

export const TrailNavigator: React.FC<TrailNavigatorProps> = ({ trails, onSelectChapter, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Jornada de Aprendizagem</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm">Fechar</button>
        </div>
        {trails.map((trail, ti) => (
          <div key={ti} className="mb-6">
            <h3 className="text-cyan-400 font-bold mb-3">{trail.title || `Trilha ${ti + 1}`}</h3>
            {trail.levels?.map((level, li) => (
              <div key={li} className="ml-4 mb-4">
                <h4 className="text-slate-300 text-sm font-bold mb-2">{level.title || `Nível ${li + 1}`}</h4>
                {level.modules?.map((mod, mi) => (
                  <div key={mi} className="ml-4 mb-2">
                    <h5 className="text-slate-400 text-xs font-bold mb-1">{mod.title || `Módulo ${mi + 1}`}</h5>
                    <div className="grid gap-1">
                      {mod.chapters?.map((ch) => (
                        <button
                          key={ch.chapter_id}
                          onClick={() => onSelectChapter(ch.chapter_id)}
                          className="text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-slate-200 transition-colors"
                        >
                          {ch.title || `Capítulo ${ch.chapter_id}`}
                          {ch.subtitle && <span className="text-slate-500 ml-2">{ch.subtitle}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
