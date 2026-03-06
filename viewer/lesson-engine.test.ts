import { describe, it, expect } from 'vitest';
import { createEngineV1, createEngineV2 } from './lesson-engine';
import type { EngineLessonV1, EngineLessonV2 } from './lesson-engine';

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
