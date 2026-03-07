import { describe, it, expect, vi } from 'vitest';
import { createEngineV1, createEngineV2 } from '../lesson-engine';
import type { EngineLessonV1, EngineLessonV2 } from '../lesson-engine';

const base = {
  session_id: 'sess',
  lesson_id: 'lesson',
  lesson_version: 1,
  total_steps: 2,
};

describe('LessonEngine V1', () => {
  it('does not advance on wrong note and has no chord buffer', () => {
    const engine = createEngineV1();
    const content: EngineLessonV1 = {
      ...base,
      notes: [
        { step_index: 0, midi: 60, start_beat: 0, duration_beats: 1 },
        { step_index: 1, midi: 62, start_beat: 1, duration_beats: 1 },
      ],
    };

    engine.loadLesson(content);
    engine.setMode('WAIT');

    let view = engine.getViewState();
    expect(view.currentStep).toBe(0);

    const miss = engine.onMidiInput(61, 100, true);
    expect(miss.result).toBe('MISS');
    view = engine.getViewState();
    expect(view.currentStep).toBe(0);

    const hit = engine.onMidiInput(60, 100, true);
    expect(hit.result).toBe('HIT');
    view = engine.getViewState();
    expect(view.currentStep).toBe(1);
  });
});

describe('LessonEngine V2', () => {
  it('requires full chord to advance', () => {
    const engine = createEngineV2();
    const content: EngineLessonV2 = {
      ...base,
      steps: [
        { step_index: 0, start_beat: 0, duration_beats: 1, notes: [60, 64] },
        { step_index: 1, start_beat: 1, duration_beats: 1, notes: [62] },
      ],
      renderNoteStartIndexByStep: [0, 2],
    };

    engine.loadLesson(content);
    engine.setMode('WAIT');

    let view = engine.getViewState();
    expect(view.currentStep).toBe(0);

    const partial = engine.onMidiInput(60, 100, true);
    expect(partial.result).toBe('HIT');
    view = engine.getViewState();
    expect(view.currentStep).toBe(0);

    const complete = engine.onMidiInput(64, 100, true);
    expect(complete.result).toBe('HIT');
    view = engine.getViewState();
    expect(view.currentStep).toBe(1);
  });
});

describe('LessonEngine Timer Integration', () => {
  it('stops the timer when forceEnd is called (V1)', () => {
    const engine = createEngineV1();
    const mockTimer = { stop: vi.fn() };

    engine.setTimer(mockTimer);
    expect(mockTimer.stop).not.toHaveBeenCalled();

    engine.forceEnd();
    expect(mockTimer.stop).toHaveBeenCalledTimes(1);
  });

  it('stops the timer when lesson completes naturally via inputs (V1)', () => {
    const engine = createEngineV1();
    const content: EngineLessonV1 = {
      ...base,
      total_steps: 1,
      notes: [{ step_index: 0, midi: 60, start_beat: 0, duration_beats: 1 }],
    };

    engine.loadLesson(content);
    engine.setMode('WAIT');

    const mockTimer = { stop: vi.fn() };
    engine.setTimer(mockTimer);

    engine.onMidiInput(60, 100, true);
    expect(mockTimer.stop).toHaveBeenCalledTimes(1);
  });

  it('does not stop the timer early before all steps are completed (V1)', () => {
    const engine = createEngineV1();
    const content: EngineLessonV1 = {
      ...base,
      total_steps: 2,
      notes: [
        { step_index: 0, midi: 60, start_beat: 0, duration_beats: 1 },
        { step_index: 1, midi: 62, start_beat: 1, duration_beats: 1 },
      ],
    };

    engine.loadLesson(content);
    engine.setMode('WAIT');

    const mockTimer = { stop: vi.fn() };
    engine.setTimer(mockTimer);

    engine.onMidiInput(60, 100, true);
    expect(mockTimer.stop).not.toHaveBeenCalled();

    engine.onMidiInput(62, 100, true);
    expect(mockTimer.stop).toHaveBeenCalledTimes(1);
  });

  it('stops the timer exactly once if completed naturally and then forceEnd is called (V1)', () => {
    const engine = createEngineV1();
    const content: EngineLessonV1 = {
      ...base,
      total_steps: 1,
      notes: [{ step_index: 0, midi: 60, start_beat: 0, duration_beats: 1 }],
    };

    engine.loadLesson(content);
    engine.setMode('WAIT');

    const mockTimer = { stop: vi.fn() };
    engine.setTimer(mockTimer);

    engine.onMidiInput(60, 100, true);
    expect(mockTimer.stop).toHaveBeenCalledTimes(1);

    engine.forceEnd();
    expect(mockTimer.stop).toHaveBeenCalledTimes(1);
  });
});

describe('LessonEngine V2 Timer Integration', () => {
  it('stops the timer when forceEnd is called (V2)', () => {
    const engine = createEngineV2();
    const mockTimer = { stop: vi.fn() };

    engine.setTimer(mockTimer);
    expect(mockTimer.stop).not.toHaveBeenCalled();

    engine.forceEnd();
    expect(mockTimer.stop).toHaveBeenCalledTimes(1);
  });

  it('stops the timer when lesson completes naturally via inputs (V2)', () => {
    const engine = createEngineV2();
    const content: EngineLessonV2 = {
      ...base,
      total_steps: 1,
      steps: [{ step_index: 0, start_beat: 0, duration_beats: 1, notes: [60] }],
    };

    engine.loadLesson(content);
    engine.setMode('WAIT');

    const mockTimer = { stop: vi.fn() };
    engine.setTimer(mockTimer);

    engine.onMidiInput(60, 100, true);
    expect(mockTimer.stop).toHaveBeenCalledTimes(1);
  });

  it('does not stop the timer early before all steps are completed (V2)', () => {
    const engine = createEngineV2();
    const content: EngineLessonV2 = {
      ...base,
      total_steps: 2,
      steps: [
        { step_index: 0, start_beat: 0, duration_beats: 1, notes: [60] },
        { step_index: 1, start_beat: 1, duration_beats: 1, notes: [62] },
      ],
    };

    engine.loadLesson(content);
    engine.setMode('WAIT');

    const mockTimer = { stop: vi.fn() };
    engine.setTimer(mockTimer);

    engine.onMidiInput(60, 100, true);
    expect(mockTimer.stop).not.toHaveBeenCalled();

    engine.onMidiInput(62, 100, true);
    expect(mockTimer.stop).toHaveBeenCalledTimes(1);
  });

  it('stops the timer exactly once if completed naturally and then forceEnd is called (V2)', () => {
    const engine = createEngineV2();
    const content: EngineLessonV2 = {
      ...base,
      total_steps: 1,
      steps: [{ step_index: 0, start_beat: 0, duration_beats: 1, notes: [60] }],
    };

    engine.loadLesson(content);
    engine.setMode('WAIT');

    const mockTimer = { stop: vi.fn() };
    engine.setTimer(mockTimer);

    engine.onMidiInput(60, 100, true);
    expect(mockTimer.stop).toHaveBeenCalledTimes(1);

    engine.forceEnd();
    expect(mockTimer.stop).toHaveBeenCalledTimes(1);
  });
});
