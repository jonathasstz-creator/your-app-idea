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
  /** Multiple lessons per chapter (e.g. uploads). Populated from catalog. */
  lessons?: TrailChapterLesson[];

  // --- Navigation metadata (aligned with backend contract) ---
  /** Chapter difficulty type */
  difficulty?: 'polyphonic_v2' | 'chords_v2';
  /** Human-readable description */
  description?: string;
  /** Allowed MIDI note names for this chapter (e.g. ["C4", "E4", "G4"]) */
  allowed_notes?: string[];
  /** Which hand(s) this chapter focuses on */
  hand?: 'right' | 'left' | 'both' | 'alternate';
  /** Skill tags for UI badges */
  skill_tags?: string[];
  /** Display badge text */
  badge?: string;
  /** Chapter IDs that must be completed before this one */
  prerequisites?: number[];
  /** If true, chapter is not yet playable */
  coming_soon?: boolean;
}

export interface TrailModule {
  module_id?: number | string;
  title?: string;
  subtitle?: string;
  hand?: 'right' | 'left' | 'both' | 'alternate';
  chapters?: TrailChapter[];
}

export interface TrailLevel {
  level_id?: number | string;
  title?: string;
  feature_flag?: string;
  modules?: TrailModule[];
}

export interface Trail {
  trail_id?: string;
  title?: string;
  subtitle?: string;
  feature_flag?: string;
  levels?: TrailLevel[];
}
