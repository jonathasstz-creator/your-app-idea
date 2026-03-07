export interface TrailChapterLesson {
  lesson_id: string;
  title?: string;
}

export interface TrailChapter {
  chapter_id: number;
  title?: string;
  subtitle?: string;
  default_lesson_id?: string;
  status?: string;
  /** Multiple lessons per chapter (e.g. uploads). Populated from backend catalog. */
  lessons?: TrailChapterLesson[];
}

export interface TrailModule {
  module_id?: number;
  title?: string;
  chapters?: TrailChapter[];
}

export interface TrailLevel {
  level_id?: number;
  title?: string;
  modules?: TrailModule[];
}

export interface Trail {
  trail_id?: string;
  title?: string;
  levels?: TrailLevel[];
}
