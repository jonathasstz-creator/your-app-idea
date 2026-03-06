export interface AppState {
  accuracy: number;
  combo: number;
  maxCombo: number;
  notesPlayed: number;
}

export type LessonMode = 'WAIT' | 'FILM';

// V1: Monophonic notes
export interface LessonNoteV1 {
  step_index: number;
  midi: number;
  start_beat: number;
  duration_beats: number;
  measure_index?: number;
  beat?: number;
  staff?: string;
  score_note_index?: number;
  status?: string; // For visual state
}

// V2: Polyphonic steps (notes[] = chord)
export interface LessonStepV2 {
  step_index?: number;
  start_beat: number;
  duration_beats?: number;
  notes: number[];
  staff?: number;
  voice?: number;
}

export interface LessonEvaluationConfig {
  hit_window_ms: number;
  late_miss_ms: number;
  early_accept_ms: number;
}

// Base metadata for lesson packets
export interface LessonPacketBase {
  session_id: string;
  lesson_id: string;
  chapter_id?: number;
  lesson_version: number;
  bpm: number;
  beats_per_measure: number;
  count_in_beats: number;
  total_steps: number;
  evaluation?: LessonEvaluationConfig;
  score?: {
    xml_text: string;
    xml_hash?: string;
  };
}

export interface LessonContentV1 {
  notes: LessonNoteV1[];
}

export interface LessonContentV2 {
  steps: LessonStepV2[];
}

export interface PacketV1 extends LessonPacketBase {
  schema_version: 1;
  content: LessonContentV1;
}

export interface PacketV2 extends LessonPacketBase {
  schema_version: 2;
  content: LessonContentV2;
}

export type LessonPacket = PacketV1 | PacketV2;

// Raw wire payload (permissive; backend stays intact)
export interface LessonContentPacket {
  type: 'lesson_content';
  session_id: string;
  lesson_id: string;
  chapter_id?: number;
  lesson_version: number;
  schema_version?: number;
  bpm: number;
  beats_per_measure: number;
  count_in_beats: number;
  total_steps: number;
  evaluation: LessonEvaluationConfig;
  score: {
    xml_text: string;
    xml_hash?: string;
  };
  notes?: LessonNoteV1[];
  steps?: LessonStepV2[];
  step_to_cursor_pos?: number[];
}

// Backward-compatible aliases
export type LessonNote = LessonNoteV1;
export type LessonStep = LessonStepV2;

export interface MidiInputPacket {
  type: 'midi_input';
  session_id?: string;
  lesson_id?: string;
  midi: number;
  velocity: number;
  is_on: boolean;
  source?: string;
  recv_at_ms: number;
}

export interface DonePacket {
  type: 'done';
  lesson_id: string;
  total_steps: number;
  status: 'DONE';
}

export interface AnalyticsEvent {
  k: 'hit' | 'miss' | 'late' | 'mode_change' | 'ended' | 'early';
  step?: number;
  midi?: number;
  error_ms?: number;
  from?: string;
  to?: string;
  timestamp: number;
}

export interface AnalyticsBatchPacket {
  type: 'analytics_batch';
  session_id: string;
  lesson_id: string;
  lesson_version: number;
  client_runtime: {
    mode: string;
    bpm: number;
    beat_now: number;
  };
  events: AnalyticsEvent[];
}
