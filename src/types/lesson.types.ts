export interface Module {
  id: string;
  name: string;
  description: string;
  icon: string;
  chapters: Chapter[];
  progress_percent: number;
}

export interface Chapter {
  id: string;
  module_id: string;
  name: string;
  lessons: Lesson[];
  progress_percent: number;
}

export interface Lesson {
  id: string;
  chapter_id: string;
  title: string;
  description: string;
  musicxml_path: string;
  total_notes: number;
  difficulty: 1 | 2 | 3 | 4 | 5;
  duration_estimate_min: number;
  completed: boolean;
  best_score?: number;
  attempts: number;
}
