import React from 'react';
import { Chapter } from '../../types/lesson.types';
import { LessonCard } from './LessonCard';

export const ChapterList: React.FC<{ chapters: Chapter[] }> = ({ chapters }) => (
  <div className="space-y-4">
    {chapters.map((chapter) => (
      <div key={chapter.id} className="p-4 rounded-xl border border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold">{chapter.name}</h4>
          <span className="text-xs text-indigo-300">{chapter.progress_percent}%</span>
        </div>
        <div className="grid gap-3">
          {chapter.lessons.map((lesson) => (
            <LessonCard key={lesson.id} lesson={lesson} />
          ))}
        </div>
      </div>
    ))}
  </div>
);
