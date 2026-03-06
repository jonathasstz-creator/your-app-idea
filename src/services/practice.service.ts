import { SHORT_DELAY_MS } from '../utils/constants';
import { mockStateFrame, mockSessionSummary, nextMode } from '../mocks/practice.mock';
import { NoteResult, PracticeMode, SessionSummary, StateFrameV1 } from '../types/practice.types';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

let currentMode: PracticeMode = 'WAIT';
let state: StateFrameV1 = { ...mockStateFrame };

export const practiceService = {
  async startSession(lessonId: string, mode: PracticeMode): Promise<string> {
    await delay(300);
    currentMode = mode;
    state = { ...mockStateFrame, lesson_id: lessonId, mode, session_id: `session_${Date.now()}` };
    return state.session_id;
  },

  getState(): StateFrameV1 {
    const jitter = Math.floor(Math.random() * 2);
    return { ...state, step: state.step + jitter, timeline_ms: state.timeline_ms + 100 };
  },

  async sendNoteEvent(note: string): Promise<NoteResult> {
    await delay(SHORT_DELAY_MS);
    const hit = Math.random() > 0.12;
    const result: NoteResult = { result: hit ? 'HIT' : 'MISS', score_delta: hit ? 50 : -10 };
    state = {
      ...state,
      score: Math.max(0, state.score + result.score_delta),
      streak: hit ? state.streak + 1 : 0,
      last_result: result.result,
      step: state.step + 1,
    };
    return result;
  },

  async endSession(sessionId: string): Promise<SessionSummary> {
    await delay(300);
    return { ...mockSessionSummary, session_id: sessionId };
  },

  cycleMode(): PracticeMode {
    currentMode = nextMode(currentMode);
    state = { ...state, mode: currentMode };
    return currentMode;
  },
};
