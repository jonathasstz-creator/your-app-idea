export type NoteName = string; // e.g. "C4", "G#3"

export type HandAssignment = 'right' | 'left' | 'both' | 'alternate';

export type Trail = {
  trail_id: string;
  title: string;
  subtitle?: string;
  /** Feature flag name that gates this trail */
  feature_flag?: string;
  levels: TrailLevel[];
};

export type TrailLevel = {
  level_id: string;
  title: string;
  subtitle?: string;
  /** Feature flag name that gates this level */
  feature_flag?: string;
  modules: TrailModule[];
};

export type TrailModule = {
  module_id: string;
  title: string;
  subtitle?: string;
  /** Inherited by all chapters in this module unless overridden */
  hand?: HandAssignment;
  chapters: TrailChapter[];
};

export type TrailChapter = {
  chapter_id: number;
  title: string;
  subtitle?: string;
  description?: string;
  allowed_notes: NoteName[];
  /** Optional UI badge, e.g. "★ Dó Central" */
  badge?: string;
  /** Override inherited hand assignment */
  hand?: HandAssignment;
  estimated_min?: number;
  skill_tags?: string[];
  /** chapter_ids that must be completed before this one unlocks */
  prerequisites?: number[];
  /** Renders as locked "Em breve" — no backend chapter needed */
  coming_soon?: boolean;
  // Phase 2: mode?: 'lesson' | 'flashcard'; flashcard_config?: FlashcardConfig;
};
