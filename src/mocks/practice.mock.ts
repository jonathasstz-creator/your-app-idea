import { PracticeMode, SessionSummary, StateFrameV1 } from '../types/practice.types';

const now = Date.now();

export const mockStateFrame: StateFrameV1 = {
  session_id: 'session_mock_1',
  lesson_id: 'lesson_001',
  mode: 'WAIT',
  step: 12,
  total_steps: 48,
  score: 1200,
  streak: 6,
  last_result: 'HIT',
  timeline_ms: 32000,
  is_paused: false,
};

export const mockSessionSummary: SessionSummary = {
  session_id: 'session_mock_1',
  lesson_id: 'lesson_001',
  started_at: new Date(now - 9 * 60 * 1000).toISOString(),
  ended_at: new Date(now).toISOString(),
  final_score: 1980,
  accuracy_percent: 0.92,
  total_notes: 48,
  notes_hit: 44,
  notes_missed: 4,
  duration_seconds: 540,
  max_streak: 12,
};

export const nextMode = (current: PracticeMode): PracticeMode => {
  const order: PracticeMode[] = ['WAIT', 'FILM', 'PLAIN'];
  const idx = order.indexOf(current);
  return order[(idx + 1) % order.length];
};
