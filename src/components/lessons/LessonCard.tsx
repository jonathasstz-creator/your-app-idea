import React from 'react';
import { Link } from 'react-router-dom';
import { Lesson } from '../../types/lesson.types';

export const LessonCard: React.FC<{ lesson: Lesson }> = ({ lesson }) => (
  <Link to={`/practice/${lesson.id}`} className="block p-3 border border-slate-800 rounded-lg hover:border-indigo-500 transition bg-slate-900/40">
    <div className="flex items-center justify-between">
      <div>
        <h5 className="font-semibold">{lesson.title}</h5>
        <p className="text-xs text-slate-500">{lesson.description}</p>
      </div>
      <div className="text-right text-xs text-slate-400">
        <div>Dificuldade: {lesson.difficulty}/5</div>
        <div>{lesson.duration_estimate_min} min · {lesson.total_notes} notas</div>
      </div>
    </div>
    {lesson.completed && <p className="text-emerald-400 text-xs mt-1">✔ Completa (best {lesson.best_score ?? '—'})</p>}
  </Link>
);
