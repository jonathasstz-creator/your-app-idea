import { MOCK_DELAY_MS } from '../utils/constants';
import { Module, Lesson } from '../types/lesson.types';
import { mockModules } from '../mocks/lessons.mock';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const lessonsService = {
  async listModules(): Promise<Module[]> {
    await delay(MOCK_DELAY_MS);
    return mockModules;
  },

  async getLesson(lessonId: string): Promise<Lesson | undefined> {
    await delay(MOCK_DELAY_MS / 2);
    return mockModules.flatMap((m) => m.chapters).flatMap((c) => c.lessons).find((l) => l.id === lessonId);
  },
};
