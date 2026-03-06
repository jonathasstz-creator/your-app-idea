export interface TrailChapter {
  chapter_id: number;
  title?: string;
  subtitle?: string;
  default_lesson_id?: string;
  status?: string;
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
