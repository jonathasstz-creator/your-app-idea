import { useEffect, useState } from 'react';
import { lessonsService } from '../services/lessons.service';
import { Lesson, Module } from '../types/lesson.types';

export function useLessons() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    lessonsService.listModules().then(setModules).finally(() => setLoading(false));
  }, []);

  const findLesson = (lessonId: string): Lesson | undefined =>
    modules.flatMap((m) => m.chapters).flatMap((c) => c.lessons).find((l) => l.id === lessonId);

  return { modules, loading, findLesson };
}
