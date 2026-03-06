export interface DailyActivity {
  date: string; // YYYY-MM-DD
  practice_minutes: number;
  lessons_completed: number;
  notes_played: number;
}

export interface ProgressPoint {
  date: string;
  value: number;
}

export interface ProgressData {
  period: '7d' | '30d' | '90d' | 'all';
  accuracy_trend: ProgressPoint[];
  score_trend: ProgressPoint[];
  time_by_module: { module: string; minutes: number }[];
}

export interface DifficultNotes {
  note: string;
  miss_rate: number;
  total_attempts: number;
}

export interface AnalyticsOverview {
  daily: DailyActivity[];
  progress: ProgressData;
  difficult_notes: DifficultNotes[];
}
