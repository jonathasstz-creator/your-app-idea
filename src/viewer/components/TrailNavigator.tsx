import React from 'react';
import type { Trail } from '../catalog/types';

interface TrailNavigatorProps {
  trails: Trail[];
  onSelectChapter: (chapterId: number, lessonId?: string) => void;
  onClose: () => void;
}

/**
 * TrailNavigator — Jornada de Aprendizagem
 *
 * Renders the hierarchical Trail[] structure from the backend catalog.
 * Supports chapters with multiple lessons (uploads) — each lesson is shown
 * as a selectable sub-item under the chapter.
 */
export const TrailNavigator: React.FC<TrailNavigatorProps> = ({ trails, onSelectChapter, onClose }) => {
  if (trails.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full text-center">
          <h2 className="text-xl font-bold text-white mb-4">Jornada de Aprendizagem</h2>
          <p className="text-slate-400 mb-6">Carregando catálogo do servidor...</p>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm">Fechar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Jornada de Aprendizagem</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm">Fechar</button>
        </div>
        {trails.map((trail, ti) => (
          <div key={trail.trail_id ?? ti} className="mb-6">
            <h3 className="text-cyan-400 font-bold mb-3">{trail.title || `Trilha ${ti + 1}`}</h3>
            {trail.levels?.map((level, li) => (
              <div key={li} className="ml-4 mb-4">
                {/* Only show level title if it differs from trail title */}
                {level.title && level.title !== trail.title && (
                  <h4 className="text-slate-300 text-sm font-bold mb-2">{level.title}</h4>
                )}
                {level.modules?.map((mod, mi) => (
                  <div key={mi} className="ml-4 mb-2">
                    {/* Only show module title if it differs from level/trail title */}
                    {mod.title && mod.title !== level.title && mod.title !== trail.title && (
                      <h5 className="text-slate-400 text-xs font-bold mb-1">{mod.title}</h5>
                    )}
                    <div className="grid gap-1">
                      {mod.chapters?.map((ch) => {
                        const hasMultipleLessons = ch.lessons && ch.lessons.length > 1;

                        if (hasMultipleLessons) {
                          // Upload chapter with multiple lessons — show each lesson
                          return (
                            <div key={ch.chapter_id} className="mb-2">
                              <div className="text-sm text-slate-300 font-medium px-3 py-1">
                                {ch.title || `Capítulo ${ch.chapter_id}`}
                              </div>
                              <div className="ml-4 grid gap-1">
                                {ch.lessons!.map((lesson) => (
                                  <button
                                    key={lesson.lesson_id}
                                    onClick={() => onSelectChapter(ch.chapter_id, lesson.lesson_id)}
                                    className="text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-slate-200 transition-colors"
                                  >
                                    {lesson.title || lesson.lesson_id}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        }

                        // Single lesson chapter — standard button
                        return (
                          <button
                            key={ch.chapter_id}
                            onClick={() => onSelectChapter(ch.chapter_id)}
                            className="text-left px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-slate-200 transition-colors"
                          >
                            {ch.title || `Capítulo ${ch.chapter_id}`}
                            {ch.subtitle && <span className="text-slate-500 ml-2">{ch.subtitle}</span>}
                          </button>
                        );
                      })}
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
