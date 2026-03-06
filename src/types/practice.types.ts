export type PracticeMode = 'WAIT' | 'FILM' | 'PLAIN';

export interface StateFrameV1 {
  session_id: string;
  lesson_id: string;
  mode: PracticeMode;
  step: number;
  total_steps: number;
  score: number;
  streak: number;
  last_result: 'HIT' | 'MISS' | 'LATE' | null;
  timeline_ms: number;
  is_paused: boolean;
}

export interface SessionEvent {
  type: 'session_start' | 'session_end' | 'note_on' | 'note_result';
  timestamp_ms: number;
  session_id: string;
  payload: any;
}

export interface NoteResult {
  result: 'HIT' | 'MISS' | 'LATE';
  score_delta: number;
  latency_ms?: number;
}

export interface SessionSummary {
  session_id: string;
  lesson_id: string;
  started_at: string;
  ended_at: string;
  final_score: number;
  accuracy_percent: number;
  total_notes: number;
  notes_hit: number;
  notes_missed: number;
  duration_seconds: number;
  max_streak: number;
}
