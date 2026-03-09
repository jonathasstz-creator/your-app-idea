import { AnalyticsEvent, AnalyticsBatchPacket, LessonMode, LessonNote, LessonStepV2 } from './types';
import { AttemptLog } from './types/task';
import {
  StepQuality,
  StepQualityState,
  createStepQualityState,
  classifyStepQuality,
  computeStreakDelta,
  HARD_ERROR_BREAK_THRESHOLD,
} from './types/step-quality';

type ResultStatus = 'HIT' | 'MISS' | 'LATE' | 'NONE';

// Helper to convert MIDI to note name
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function midiToNoteName(midi: number): string {
  const octave = Math.floor((midi - 12) / 12);
  const noteIndex = midi % 12;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

interface ActiveStepState {
  stepIndex: number;
  expectedMidis: Set<number>;
  hitMidis: Set<number>;
  firstHitTime: number | null;
  status: 'WAITING' | 'PARTIAL' | 'COMPLETE' | 'MISSED';
  windowStart: number;
  windowEnd: number;
}

export interface ViewState {
  mode: LessonMode;
  currentStep: number;
  totalSteps: number;
  visualBeat: number;
  cursorIndex: number;
  status: 'IDLE' | 'PLAYING' | 'WAITING' | 'DONE';
  score: number;
  streak: number;
  bestStreak: number;
  lastResult: ResultStatus;
  feedback: {
    status: ResultStatus;
    step: number;
  };
  scoreNoteIndex?: number;
}

export interface LessonEngineApi {
  loadLesson(content: EngineLessonV1 | EngineLessonV2): void;
  setMode(mode: LessonMode): void;
  reset(): void;
  forceEnd(): void;
  setTimer(timer: { stop: () => void } | null): void;
  onMidiInput(midi: number, velocity: number, isOn: boolean): { advanced: boolean; result: ResultStatus; score: number; streak: number };
  judgeFilmNoteOn(
    midi: number,
    velocity: number,
    beatNow: number,
    bpm: number,
    windowMs: number
  ): {
    result: ResultStatus;
    expected?: number;
    deltaMs?: number;
    step?: number;
    completedStep?: boolean;
    accuracy?: 'PERFECT' | 'GOOD' | 'OK' | 'LATE';
    progress?: string;
  };
  tickFilm(beatNow: number, bpm: number, windowMs: number): { result: 'HIT' | 'MISS' | 'NONE'; step?: number; deltaMs?: number };
  getViewState(): ViewState;
  getExpectedMidi(stepIndex?: number): number | null;
  flushAnalytics(): AnalyticsBatchPacket | null;
  // Endscreen integration
  getAttemptLog(): AttemptLog[];
  getLessonMeta(): { lessonId: string | null; chapterId: number | null; totalSteps: number };
  setOnEnded(callback: (() => void) | null): void;
  // Scoring contract: engine-derived truth for V2 metrics
  getCompletedSteps(): number;
  getTotalExpectedNotes(): number;
}

export interface EngineLessonBase {
  session_id: string;
  lesson_id: string;
  lesson_version: number;
  total_steps: number;
  step_to_cursor_pos?: number[];
}

export interface EngineLessonV1 extends EngineLessonBase {
  notes: LessonNote[];
}

export interface EngineLessonV2 extends EngineLessonBase {
  steps: LessonStepV2[];
  renderNoteStartIndexByStep?: number[];
}

const emptyViewState = (): ViewState => ({
  mode: 'WAIT',
  currentStep: 0,
  totalSteps: 0,
  visualBeat: 0,
  cursorIndex: 0,
  status: 'IDLE',
  score: 0,
  streak: 0,
  bestStreak: 0,
  lastResult: 'NONE',
  feedback: { status: 'NONE', step: -1 },
});

class LessonEngineV1 implements LessonEngineApi {
  private lesson: EngineLessonV1 | null = null;
  private notes: LessonNote[] = [];
  private mode: LessonMode = 'WAIT';

  private currentStep = 0;
  private isEnded = false;
  private score = 0;
  private streak = 0;
  private bestStreak = 0;
  private lastResult: ResultStatus = 'NONE';
  private lastResultStep = -1;
  private judgedSteps: Set<number> = new Set();
  private analyticsQueue: AnalyticsEvent[] = [];

  // FILM mode state
  private activeStepIndex: number | null = null;
  private activeStepHit = false;

  // FILM timing constants
  private readonly STEP_ACTIVATION_AHEAD_MS = 300;
  private readonly STEP_PERFECT_WINDOW_MS = 100;
  private readonly STEP_GOOD_WINDOW_MS = 200;
  private readonly STEP_MISS_AFTER_MS = 500;

  // Endscreen tracking
  private attemptLog: AttemptLog[] = [];
  private stepStartTime = 0;
  private onEndedCallback: (() => void) | null = null;
  private timer: { stop: () => void } | null = null;
  private endedNotified = false;

  loadLesson(content: EngineLessonV1) {
    this.lesson = content;
    this.notes = [...(content.notes || [])].sort((a, b) => a.step_index - b.step_index);
    this.reset();
  }

  setMode(mode: LessonMode) {
    if (!this.lesson || mode === this.mode) return;
    this.pushAnalytics({
      k: 'mode_change',
      from: this.mode,
      to: mode,
      timestamp: Date.now(),
    });
    this.mode = mode;
  }

  reset() {
    this.currentStep = 0;
    this.isEnded = false;
    this.endedNotified = false;
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.lastResult = 'NONE';
    this.lastResultStep = -1;
    this.judgedSteps.clear();
    this.activeStepIndex = null;
    this.activeStepHit = false;
    this.attemptLog = [];
    this.stepStartTime = Date.now();
  }

  forceEnd() {
    if (this.isEnded) return;
    this.isEnded = true;
    this.timer?.stop();
    this.pushAnalytics({ k: 'ended', timestamp: Date.now() });
    this.notifyEnded();
  }

  setTimer(timer: { stop: () => void } | null) {
    this.timer = timer;
  }

  onMidiInput(midi: number, velocity: number, isOn: boolean): { advanced: boolean; result: ResultStatus; score: number; streak: number } {
    if (this.isEnded || !this.lesson || !isOn || velocity === 0) {
      return { advanced: false, result: 'NONE' as ResultStatus, score: this.score, streak: this.streak };
    }

    const note = this.notes[this.currentStep];
    if (!note) return { advanced: false, result: 'NONE' as ResultStatus, score: this.score, streak: this.streak };

    const midiInt = Math.round(midi);
    const expectedMidi = note.midi;
    
    if (expectedMidi === midiInt) {
      this.logAttempt(midiInt, expectedMidi, true);
      this.onStepComplete('HIT');
      return { advanced: true, result: 'HIT' as ResultStatus, score: this.score, streak: this.streak };
    }

    this.logAttempt(midiInt, expectedMidi, false);
    this.onStepComplete('MISS');
    return { advanced: false, result: 'MISS' as ResultStatus, score: this.score, streak: this.streak };
  }

  tickFilm(
    beatNow: number,
    bpm: number,
    _windowMs: number
  ): { result: 'HIT' | 'MISS' | 'NONE'; step?: number; deltaMs?: number } {
    if (!this.lesson || this.isEnded) return { result: 'NONE' as const };
    const msPerBeat = 60000 / Math.max(1, bpm);

    if (this.activeStepIndex === null) {
      let nextStepIndex = -1;
      for (let i = 0; i < this.notes.length; i++) {
        if (!this.judgedSteps.has(i)) {
          nextStepIndex = i;
          break;
        }
      }

      if (nextStepIndex === -1) {
        return { result: 'NONE' as const };
      }

      const stepBeat = this.notes[nextStepIndex].start_beat;
      const deltaMs = (beatNow - stepBeat) * msPerBeat;

      if (deltaMs >= -this.STEP_ACTIVATION_AHEAD_MS) {
        this.activateStep(nextStepIndex);
      }
    }

    if (this.activeStepIndex !== null) {
      const stepBeat = this.notes[this.activeStepIndex].start_beat;
      const deltaMs = (beatNow - stepBeat) * msPerBeat;
      if (deltaMs > this.STEP_MISS_AFTER_MS && !this.activeStepHit) {
        const missed = this.activeStepIndex;
        const expectedMidi = this.notes[missed].midi;
        
        // Log missed attempt (PR3)
        this.logAttempt(expectedMidi, expectedMidi, false);
        
        this.applyFilmResult(missed, 'MISS');
        this.activeStepIndex = null;
        this.activeStepHit = false;
        return { result: 'MISS' as const, step: missed, deltaMs };
      }
    }

    return { result: 'NONE' as const };
  }

  judgeFilmNoteOn(
    midi: number,
    velocity: number,
    beatNow: number,
    bpm: number,
    _windowMs: number
  ): {
    result: ResultStatus;
    expected?: number;
    deltaMs?: number;
    step?: number;
    completedStep?: boolean;
    accuracy?: 'PERFECT' | 'GOOD' | 'OK' | 'LATE';
  } {
    if (!this.lesson || this.isEnded || velocity === 0) return { result: 'NONE' as const };
    if (!Number.isFinite(beatNow) || !Number.isFinite(bpm) || bpm <= 0) return { result: 'NONE' as const };

    if (this.activeStepIndex === null) {
      const idx = this.findFilmStepFromBeat(beatNow);
      const step = this.notes[idx];
      if (step) {
        const msPerBeat = 60000 / bpm;
        const deltaMs = (beatNow - step.start_beat) * msPerBeat;
        if (deltaMs <= this.STEP_MISS_AFTER_MS) {
          this.activateStep(idx);
        }
      }
      if (this.activeStepIndex === null) return { result: 'NONE' as const };
    }

    const step = this.notes[this.activeStepIndex];
    const expectedMidi = step.midi;
    const midiInt = Math.round(midi);
    const msPerBeat = 60000 / bpm;
    const deltaMs = (beatNow - step.start_beat) * msPerBeat;

    if (midiInt !== expectedMidi || this.activeStepHit) {
      return { result: 'NONE' as const, deltaMs, step: this.activeStepIndex };
    }

    this.activeStepHit = true;

    let accuracy: 'PERFECT' | 'GOOD' | 'OK' | 'LATE';
    const absDelta = Math.abs(deltaMs);
    if (absDelta <= this.STEP_PERFECT_WINDOW_MS) {
      accuracy = 'PERFECT';
    } else if (absDelta <= this.STEP_GOOD_WINDOW_MS) {
      accuracy = 'GOOD';
    } else if (deltaMs <= this.STEP_MISS_AFTER_MS) {
      accuracy = deltaMs < 0 ? 'OK' : 'LATE';
    } else {
      accuracy = 'LATE';
    }

    const finishedStepIndex = this.activeStepIndex;
    
    // Log attempt for FILM mode HIT (PR3)
    this.logAttempt(midiInt, expectedMidi, true);
    
    this.applyFilmResult(finishedStepIndex, 'HIT', accuracy);
    this.activeStepIndex = null;
    this.activeStepHit = false;

    return {
      result: 'HIT',
      accuracy,
      deltaMs,
      step: finishedStepIndex,
      completedStep: true,
    };
  }

  getViewState(): ViewState {
    if (!this.lesson) return emptyViewState();

    const cursorIdx = this.lesson.step_to_cursor_pos
      ? (this.lesson.step_to_cursor_pos[this.currentStep] ?? this.currentStep)
      : this.currentStep;
    const scoreNoteIndex = this.notes[this.currentStep]?.step_index ?? this.currentStep;

    return {
      mode: this.mode,
      currentStep: this.currentStep,
      totalSteps: this.notes.length,
      visualBeat: 0,
      cursorIndex: cursorIdx,
      status: this.isEnded ? 'DONE' : (this.mode === 'FILM' ? 'PLAYING' : 'WAITING'),
      score: this.score,
      streak: this.streak,
      bestStreak: this.bestStreak,
      lastResult: this.lastResult,
      feedback: { status: this.lastResult, step: this.lastResultStep },
      scoreNoteIndex,
    };
  }

  getExpectedMidi(stepIndex?: number): number | null {
    const idx = stepIndex !== undefined ? stepIndex : this.currentStep;
    const note = this.notes[idx];
    return note ? note.midi : null;
  }

  flushAnalytics(): AnalyticsBatchPacket | null {
    if (this.analyticsQueue.length === 0) return null;
    const events = [...this.analyticsQueue];
    this.analyticsQueue = [];
    return {
      type: 'analytics_batch',
      session_id: this.lesson?.session_id || '',
      lesson_id: this.lesson?.lesson_id || '',
      lesson_version: this.lesson?.lesson_version || 0,
      client_runtime: {
        mode: this.mode,
        bpm: 0,
        beat_now: 0,
      },
      events,
    };
  }

  private onStepComplete(status: Exclude<ResultStatus, 'NONE'>, errorMs?: number) {
    this.pushAnalytics({
      k: status.toLowerCase() as any,
      step: this.currentStep,
      error_ms: errorMs,
      timestamp: Date.now(),
    });

    if (status === 'HIT') {
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      this.score += 1;
      this.currentStep += 1;
    } else {
      this.streak = 0;
    }

    this.lastResult = status;
    this.lastResultStep = this.currentStep;

    console.log(`[EngineV1] onStepComplete: step=${this.currentStep}, total=${this.notes.length}, status=${status}`);

    if (this.currentStep >= this.notes.length) {
      console.log('[EngineV1] Lesson completed! Calling forceEnd');
      // forceEnd() already calls notifyEnded() internally — do NOT call it again here
      this.forceEnd();
    }
  }

  private findFilmStepFromBeat(beat: number): number {
    let lo = 0;
    let hi = this.notes.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const nb = this.notes[mid].start_beat;
      if (nb <= beat) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }

  private activateStep(index: number) {
    this.activeStepIndex = index;
    this.activeStepHit = false;
  }

  private applyFilmResult(step: number, status: Exclude<ResultStatus, 'NONE'>, _accuracy?: 'PERFECT' | 'GOOD' | 'OK' | 'LATE') {
    this.judgedSteps.add(step);
    this.lastResult = status;
    this.lastResultStep = step;
    if (status === 'HIT') {
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      this.score += 1;
    } else {
      this.streak = 0;
    }
  }

  private pushAnalytics(event: AnalyticsEvent) {
    this.analyticsQueue.push(event);
  }

  // Endscreen integration methods
  getAttemptLog(): AttemptLog[] {
    return [...this.attemptLog];
  }

  getLessonMeta(): { lessonId: string | null; chapterId: number | null; totalSteps: number } {
    return {
      lessonId: this.lesson?.lesson_id ?? null,
      chapterId: null, // V1 não tem chapter_id
      totalSteps: this.notes.length,
    };
  }

  setOnEnded(callback: (() => void) | null) {
    console.log(`[EngineV1] setOnEnded: ${callback ? 'callback provided' : 'null'}`);
    this.onEndedCallback = callback;
  }

  getCompletedSteps(): number {
    return this.score;
  }

  getTotalExpectedNotes(): number {
    return this.notes.length; // V1: 1 note per step
  }

  private logAttempt(midi: number, expected: number, success: boolean) {
    const now = Date.now();
    const responseMs = this.stepStartTime > 0 ? now - this.stepStartTime : undefined;
    
    this.attemptLog.push({
      stepIndex: this.currentStep,
      midi,
      noteName: midiToNoteName(midi),
      expected,
      success,
      responseMs,
      timestamp: now,
    });

    // Reset step timer for next step
    if (success) {
      this.stepStartTime = now;
    }
  }

  private notifyEnded() {
    console.log(`[EngineV1] notifyEnded: hasCallback=${!!this.onEndedCallback}, isEnded=${this.isEnded}`);
    if (this.endedNotified) return; // idempotent — prevents double-fire
    this.endedNotified = true;
    if (this.onEndedCallback && this.isEnded) {
      console.log('[EngineV1] Calling onEndedCallback via setTimeout');
      // Defer to allow state to settle
      setTimeout(() => this.onEndedCallback?.(), 0);
    }
  }
}

class LessonEngineV2 implements LessonEngineApi {
  private lesson: EngineLessonV2 | null = null;
  private steps: LessonStepV2[] = [];
  private mode: LessonMode = 'WAIT';

  private currentStep = 0;
  private isEnded = false;
  private score = 0;
  private streak = 0;
  private bestStreak = 0;
  private lastResult: ResultStatus = 'NONE';
  private lastResultStep = -1;
  private judgedSteps: Set<number> = new Set();
  private analyticsQueue: AnalyticsEvent[] = [];
  private stepState: Set<number> = new Set();

  private activeStep: ActiveStepState | null = null;

  private readonly STEP_ACTIVATION_AHEAD_MS = 300;
  private readonly STEP_PERFECT_WINDOW_MS = 100;
  private readonly STEP_GOOD_WINDOW_MS = 200;
  private readonly STEP_MISS_AFTER_MS = 500;

  // Endscreen tracking
  private attemptLog: AttemptLog[] = [];
  private stepStartTime = 0;
  private onEndedCallback: (() => void) | null = null;
  private timer: { stop: () => void } | null = null;
  private endedNotified = false;

  // Step Quality tracking (active behind useStepQualityStreak flag)
  private stepQualityState: StepQualityState = createStepQualityState();
  private stepQualities: StepQuality[] = [];
  private useStepQuality = false;

  loadLesson(content: EngineLessonV2) {
    this.lesson = content;
    this.steps = [...(content.steps || [])]
      .map((step, idx) => ({ step, idx }))
      .sort((a, b) => {
        const aIdx = Number.isFinite(a.step.step_index) ? Number(a.step.step_index) : a.idx;
        const bIdx = Number.isFinite(b.step.step_index) ? Number(b.step.step_index) : b.idx;
        return aIdx - bIdx;
      })
      .map(({ step }) => step);
    this.reset();
  }

  setMode(mode: LessonMode) {
    if (!this.lesson || mode === this.mode) return;
    this.pushAnalytics({
      k: 'mode_change',
      from: this.mode,
      to: mode,
      timestamp: Date.now(),
    });
    this.mode = mode;
  }

  reset() {
    this.currentStep = 0;
    this.isEnded = false;
    this.endedNotified = false;
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.lastResult = 'NONE';
    this.lastResultStep = -1;
    this.judgedSteps.clear();
    this.stepState.clear();
    this.activeStep = null;
    this.attemptLog = [];
    this.stepStartTime = Date.now();
    this.stepQualityState = createStepQualityState();
    this.stepQualities = [];
  }

  /** Enable step quality streak (call before loadLesson or after reset). */
  setUseStepQuality(enabled: boolean) {
    this.useStepQuality = enabled;
  }

  forceEnd() {
    if (this.isEnded) return;
    this.isEnded = true;
    this.timer?.stop();
    this.pushAnalytics({ k: 'ended', timestamp: Date.now() });
    this.notifyEnded();
  }

  setTimer(timer: { stop: () => void } | null) {
    this.timer = timer;
  }

  onMidiInput(midi: number, velocity: number, isOn: boolean): { advanced: boolean; result: ResultStatus; score: number; streak: number } {
    if (this.isEnded || !this.lesson || !isOn || velocity === 0) {
      return { advanced: false, result: 'NONE' as ResultStatus, score: this.score, streak: this.streak };
    }

    const targetStep = this.steps[this.currentStep];
    if (!targetStep) return { advanced: false, result: 'NONE' as ResultStatus, score: this.score, streak: this.streak };

    const midiInt = Math.round(midi);
    const chordNotes = Array.isArray(targetStep.notes) ? targetStep.notes : [];
    const expectedMidi = chordNotes.length > 0 ? chordNotes[0] : midiInt;

    if (chordNotes.includes(midiInt) && !this.stepState.has(midiInt)) {
      this.stepState.add(midiInt);
      const isComplete = chordNotes.every((m) => this.stepState.has(m));
      // Use midiInt as expected (not chordNotes[0]) so AttemptLog.expected
      // reflects the actual chord note being satisfied, not just the root.
      this.logAttempt(midiInt, midiInt, true);
      if (isComplete) {
        this.onStepComplete('HIT');
        return { advanced: true, result: 'HIT' as ResultStatus, score: this.score, streak: this.streak };
      }
      return { advanced: false, result: 'HIT' as ResultStatus, score: this.score, streak: this.streak };
    }

    if (!chordNotes.includes(midiInt)) {
      this.logAttempt(midiInt, expectedMidi, false);
      this.onStepComplete('MISS');
      return { advanced: false, result: 'MISS' as ResultStatus, score: this.score, streak: this.streak };
    }

    return { advanced: false, result: 'NONE' as ResultStatus, score: this.score, streak: this.streak };
  }

  tickFilm(
    beatNow: number,
    bpm: number,
    _windowMs: number
  ): { result: 'HIT' | 'MISS' | 'NONE'; step?: number; deltaMs?: number } {
    if (!this.lesson || this.isEnded) return { result: 'NONE' as const };
    const msPerBeat = 60000 / Math.max(1, bpm);

    if (!this.activeStep) {
      let nextStepIndex = -1;
      for (let i = 0; i < this.steps.length; i++) {
        if (!this.judgedSteps.has(i)) {
          nextStepIndex = i;
          break;
        }
      }
      if (nextStepIndex === -1) {
        return { result: 'NONE' as const };
      }

      const step = this.steps[nextStepIndex];
      const deltaMs = (beatNow - step.start_beat) * msPerBeat;

      // [FILM:PROBE] Inspect raw step candidates
      console.log("[FILM:PROBE] step raw", {
        stepIndex: nextStepIndex,
        keys: Object.keys(step as any),
        start_beat: (step as any).start_beat,
        duration_beats: (step as any).duration_beats,
        notes: (step as any).notes,
        notesType: Array.isArray((step as any).notes) ? "array" : typeof (step as any).notes,
      });

      if (deltaMs >= -this.STEP_ACTIVATION_AHEAD_MS) {
        this.activateStep(nextStepIndex, step, bpm);
        // Debug log as requested for activation
        console.log('[FILM:STEP] Activate', {
          stepIndex: nextStepIndex,
          status: 'WAITING',
          expectedMidis: Array.from(this.activeStep!.expectedMidis),
          deltaMs
        });
      }
    }

    if (this.activeStep) {
      const step = this.steps[this.activeStep.stepIndex];
      const deltaMs = (beatNow - step.start_beat) * msPerBeat;
      const missAfterMs = this.getStepMissAfterMs(step, bpm);
      if (deltaMs > missAfterMs && this.activeStep.status !== 'COMPLETE') {
        const missed = this.activeStep.stepIndex;
        console.log('[FILM:STEP] Missed', {
          stepIndex: missed,
          status: 'MISSED',
          hitMidis: Array.from(this.activeStep.hitMidis),
          expectedMidis: Array.from(this.activeStep.expectedMidis),
          deltaMs
        });
        
        // Log missed attempt (PR3)
        const hitMidis = Array.from(this.activeStep.hitMidis);
        const expectedMidis = Array.from(this.activeStep.expectedMidis);
        this.logFilmAttempt(missed, hitMidis, expectedMidis, false);
        
        this.applyFilmResult(missed, 'MISS');
        this.activeStep = null;
        return { result: 'MISS' as const, step: missed, deltaMs };
      }
    }

    return { result: 'NONE' as const };
  }

  judgeFilmNoteOn(
    midi: number,
    velocity: number,
    beatNow: number,
    bpm: number,
    _windowMs: number
  ): {
    result: ResultStatus;
    expected?: number;
    deltaMs?: number;
    step?: number;
    completedStep?: boolean;
    accuracy?: 'PERFECT' | 'GOOD' | 'OK' | 'LATE';
    progress?: string;
  } {
    if (!this.lesson || this.isEnded || velocity === 0) {
      return { result: 'NONE' as const };
    }
    if (!Number.isFinite(beatNow) || !Number.isFinite(bpm) || bpm <= 0) {
      return { result: 'NONE' as const };
    }

    if (!this.activeStep) {
      const idx = this.findFilmStepFromBeat(beatNow);
      const step = this.steps[idx];
      if (step) {
        const msPerBeat = 60000 / bpm;
        const deltaMs = (beatNow - step.start_beat) * msPerBeat;
        const missAfterMs = this.getStepMissAfterMs(step, bpm);
        if (deltaMs <= missAfterMs) {
          this.activateStep(idx, step, bpm);
          console.log('[FILM:STEP] Late Activate', {
            stepIndex: idx,
            status: 'WAITING',
            deltaMs
          });
        }
      }
      if (!this.activeStep) return { result: 'NONE' as const };
    }

    const step = this.steps[this.activeStep.stepIndex];
    const msPerBeat = 60000 / bpm;
    const deltaMs = (beatNow - step.start_beat) * msPerBeat;
    const missAfterMs = this.getStepMissAfterMs(step, bpm);
    const midiInt = Math.round(midi);

    if (!this.activeStep.expectedMidis.has(midiInt)) {
      return { result: 'NONE' as const, deltaMs, step: this.activeStep.stepIndex };
    }
    if (this.activeStep.hitMidis.has(midiInt)) {
      return { result: 'NONE' as const, deltaMs, step: this.activeStep.stepIndex };
    }

    this.activeStep.hitMidis.add(midiInt);
    if (this.activeStep.firstHitTime === null) {
      this.activeStep.firstHitTime = Date.now();
    }

    const isComplete = this.activeStep.hitMidis.size === this.activeStep.expectedMidis.size;

    console.log('[FILM:STEP] Note Input', {
      stepIndex: this.activeStep.stepIndex,
      midi: midiInt,
      status: isComplete ? 'COMPLETE' : 'PARTIAL',
      hitMidis: Array.from(this.activeStep.hitMidis),
      deltaMs
    });

    if (isComplete) {
      this.activeStep.status = 'COMPLETE';

      let accuracy: 'PERFECT' | 'GOOD' | 'OK' | 'LATE';
      const absDelta = Math.abs(deltaMs);
      if (absDelta <= this.STEP_PERFECT_WINDOW_MS) {
        accuracy = 'PERFECT';
      } else if (absDelta <= this.STEP_GOOD_WINDOW_MS) {
        accuracy = 'GOOD';
      } else if (deltaMs <= missAfterMs) {
        accuracy = deltaMs < 0 ? 'OK' : 'LATE';
      } else {
        accuracy = 'LATE';
      }

      const finishedStepIndex = this.activeStep.stepIndex;
      
      // Log attempt for FILM mode (PR3)
      const hitMidis = Array.from(this.activeStep.hitMidis);
      const expectedMidis = Array.from(this.activeStep.expectedMidis);
      this.logFilmAttempt(finishedStepIndex, hitMidis, expectedMidis, true);
      
      this.applyFilmResult(finishedStepIndex, 'HIT', accuracy);
      this.activeStep = null;

      return {
        result: 'HIT',
        accuracy,
        deltaMs,
        step: finishedStepIndex,
        completedStep: true,
      };
    }

    this.activeStep.status = 'PARTIAL';
    return {
      result: 'HIT',
      completedStep: false,
      deltaMs,
      step: this.activeStep.stepIndex,
      progress: `${this.activeStep.hitMidis.size}/${this.activeStep.expectedMidis.size}`,
    };
  }

  getViewState(): ViewState {
    if (!this.lesson) return emptyViewState();

    const cursorIdx = this.lesson.step_to_cursor_pos
      ? (this.lesson.step_to_cursor_pos[this.currentStep] ?? this.currentStep)
      : this.currentStep;

    return {
      mode: this.mode,
      currentStep: this.currentStep,
      totalSteps: this.steps.length,
      visualBeat: 0,
      cursorIndex: cursorIdx,
      status: this.isEnded ? 'DONE' : (this.mode === 'FILM' ? 'PLAYING' : 'WAITING'),
      score: this.score,
      streak: this.streak,
      bestStreak: this.bestStreak,
      lastResult: this.lastResult,
      feedback: { status: this.lastResult, step: this.lastResultStep },
      scoreNoteIndex: this.getScoreNoteIndex(),
    };
  }

  getExpectedMidi(stepIndex?: number): number | null {
    const idx = stepIndex !== undefined ? stepIndex : this.currentStep;
    const step = this.steps[idx];
    return step && step.notes && step.notes.length > 0 ? step.notes[0] : null;
  }

  flushAnalytics(): AnalyticsBatchPacket | null {
    if (this.analyticsQueue.length === 0) return null;
    const events = [...this.analyticsQueue];
    this.analyticsQueue = [];
    return {
      type: 'analytics_batch',
      session_id: this.lesson?.session_id || '',
      lesson_id: this.lesson?.lesson_id || '',
      lesson_version: this.lesson?.lesson_version || 0,
      client_runtime: {
        mode: this.mode,
        bpm: 0,
        beat_now: 0,
      },
      events,
    };
  }

  private onStepComplete(status: Exclude<ResultStatus, 'NONE'>, errorMs?: number) {
    this.pushAnalytics({
      k: status.toLowerCase() as any,
      step: this.currentStep,
      error_ms: errorMs,
      timestamp: Date.now(),
    });

    if (status === 'HIT') {
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      this.score += 1;
      this.currentStep += 1;
      this.stepState.clear();
    } else {
      this.streak = 0;
      this.stepState.clear();
    }

    this.lastResult = status;
    this.lastResultStep = this.currentStep;

    console.log(`[EngineV2] onStepComplete: step=${this.currentStep}, total=${this.steps.length}, status=${status}`);

    if (this.currentStep >= this.steps.length) {
      console.log('[EngineV2] Lesson completed! Calling forceEnd');
      // forceEnd() already calls notifyEnded() internally — do NOT call it again here
      this.forceEnd();
    }
  }

  private getScoreNoteIndex(): number {
    const step = this.steps[this.currentStep];
    if (!step) return this.currentStep;

    const baseIndex = this.lesson?.renderNoteStartIndexByStep?.[this.currentStep] ?? this.currentStep;
    const notesHit = this.stepState.size;
    return baseIndex + notesHit;
  }

  private findFilmStepFromBeat(beat: number): number {
    let lo = 0;
    let hi = this.steps.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const nb = this.steps[mid].start_beat;
      if (nb <= beat) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }

  private applyFilmResult(step: number, status: Exclude<ResultStatus, 'NONE'>, _accuracy?: 'PERFECT' | 'GOOD' | 'OK' | 'LATE') {
    this.judgedSteps.add(step);
    this.lastResult = status;
    this.lastResultStep = step;
    if (status === 'HIT') {
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      this.score += 1;
    } else {
      this.streak = 0;
    }
  }

  private activateStep(index: number, step: LessonStepV2, bpm: number) {
    const msPerBeat = 60000 / Math.max(1, bpm);
    const missAfterMs = this.getStepMissAfterMs(step, bpm);
    const midiArray = Array.isArray(step.notes) ? step.notes : [];
    const numericMidis = midiArray.map((m) => Math.round(Number(m))).filter((m) => !Number.isNaN(m));

    this.activeStep = {
      stepIndex: index,
      expectedMidis: new Set(numericMidis),
      hitMidis: new Set(),
      firstHitTime: null,
      status: 'WAITING',
      windowStart: step.start_beat - (this.STEP_ACTIVATION_AHEAD_MS / msPerBeat),
      windowEnd: step.start_beat + (missAfterMs / msPerBeat),
    };
  }

  private getStepMissAfterMs(step: LessonStepV2, bpm: number): number {
    const durationBeats = Number((step as any).duration_beats);
    if (Number.isFinite(durationBeats) && durationBeats > 0) {
      const msPerBeat = 60000 / Math.max(1, bpm);
      return Math.max(this.STEP_MISS_AFTER_MS, durationBeats * msPerBeat);
    }
    return this.STEP_MISS_AFTER_MS;
  }

  private pushAnalytics(event: AnalyticsEvent) {
    this.analyticsQueue.push(event);
  }

  // Endscreen integration methods
  getAttemptLog(): AttemptLog[] {
    return [...this.attemptLog];
  }

  getLessonMeta(): { lessonId: string | null; chapterId: number | null; totalSteps: number } {
    return {
      lessonId: this.lesson?.lesson_id ?? null,
      chapterId: (this.lesson as any)?.chapter_id ?? null,
      totalSteps: this.steps.length,
    };
  }

  setOnEnded(callback: (() => void) | null) {
    console.log(`[EngineV2] setOnEnded: ${callback ? 'callback provided' : 'null'}`);
    this.onEndedCallback = callback;
  }

  getCompletedSteps(): number {
    return this.score;
  }

  getTotalExpectedNotes(): number {
    return this.steps.reduce((sum, s) => sum + (s.notes?.length ?? 0), 0);
  }

  private logAttempt(midi: number, expected: number, success: boolean) {
    const now = Date.now();
    const responseMs = this.stepStartTime > 0 ? now - this.stepStartTime : undefined;
    
    this.attemptLog.push({
      stepIndex: this.currentStep,
      midi,
      noteName: midiToNoteName(midi),
      expected,
      success,
      responseMs,
      timestamp: now,
    });

    // Reset step timer for next step
    if (success) {
      this.stepStartTime = now;
    }
  }

  // PR3: Log attempt for FILM mode (supports chords)
  private logFilmAttempt(stepIndex: number, hitMidis: number[], expectedMidis: number[], success: boolean) {
    const now = Date.now();
    
    // Calculate response time from first hit
    const responseMs = this.activeStep?.firstHitTime 
      ? now - this.activeStep.firstHitTime 
      : undefined;
    
    this.attemptLog.push({
      stepIndex,
      midi: hitMidis.length === 1 ? hitMidis[0] : hitMidis,
      noteName: hitMidis.length === 1 
        ? midiToNoteName(hitMidis[0]) 
        : hitMidis.map(m => midiToNoteName(m)).join(', '),
      expected: expectedMidis.length === 1 ? expectedMidis[0] : expectedMidis,
      success,
      responseMs,
      timestamp: now,
    });
  }

  private notifyEnded() {
    console.log(`[EngineV2] notifyEnded: hasCallback=${!!this.onEndedCallback}, isEnded=${this.isEnded}`);
    if (this.endedNotified) return; // idempotent — prevents double-fire
    this.endedNotified = true;
    if (this.onEndedCallback && this.isEnded) {
      console.log('[EngineV2] Calling onEndedCallback via setTimeout');
      // Defer to allow state to settle
      setTimeout(() => this.onEndedCallback?.(), 0);
    }
  }
}

export function createEngineV1(): LessonEngineApi {
  return new LessonEngineV1();
}

export function createEngineV2(): LessonEngineApi {
  return new LessonEngineV2();
}
