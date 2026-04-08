/**
 * Chord Simultaneity Timeout — Anti-regression tests
 *
 * Bug: In V2 WAIT mode, stepState (partial chord) never expires.
 * Playing one note of a chord, waiting 10+ seconds, then playing the other
 * still completes the step — defeating the purpose of chord practice.
 *
 * Fix: Add CHORD_WINDOW_MS (~2000ms). If time between first note hit and
 * a subsequent note exceeds this window, partial state auto-resets.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEngineV2, type LessonEngineApi } from '../lesson-engine';

function createV2Engine(): LessonEngineApi {
  return createEngineV2();
}

function makeChordLesson(chords: number[][]) {
  return {
    session_id: 'test-session',
    lesson_id: 'chord-timeout-test',
    lesson_version: 2,
    total_steps: chords.length,
    steps: chords.map((notes, i) => ({
      step_index: i,
      notes,
      start_beat: i,
      duration_beats: 1,
    })),
  };
}

describe('V2 WAIT — Chord simultaneity window', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('completes chord when notes are played within the window', () => {
    const engine = createV2Engine();
    engine.loadLesson(makeChordLesson([[60, 64]])); // C4 + E4
    engine.setMode('WAIT');

    // Play first note
    const r1 = engine.onMidiInput(60, 80, true);
    expect(r1.advanced).toBe(false);
    expect(r1.result).toBe('HIT');

    // Play second note 500ms later — within window
    vi.advanceTimersByTime(500);
    const r2 = engine.onMidiInput(64, 80, true);
    expect(r2.advanced).toBe(true);
    expect(r2.result).toBe('HIT');
  });

  it('resets partial chord state when window expires', () => {
    const engine = createV2Engine();
    engine.loadLesson(makeChordLesson([[60, 64]])); // C4 + E4
    engine.setMode('WAIT');

    // Play first note
    engine.onMidiInput(60, 80, true);

    // Wait 3 seconds — beyond chord window
    vi.advanceTimersByTime(3000);

    // Play second note — should NOT complete chord because window expired
    const r2 = engine.onMidiInput(64, 80, true);
    // After timeout, stepState was reset. 64 is a correct note, so it starts fresh partial
    expect(r2.advanced).toBe(false);
    // Still need to play 60 again to complete
  });

  it('after window expiry, replaying both notes completes the chord', () => {
    const engine = createV2Engine();
    engine.loadLesson(makeChordLesson([[60, 64]]));
    engine.setMode('WAIT');

    // First attempt — partial, then timeout
    engine.onMidiInput(60, 80, true);
    vi.advanceTimersByTime(3000);
    engine.onMidiInput(64, 80, true); // starts fresh partial

    // Now play the missing note within window
    vi.advanceTimersByTime(200);
    const r = engine.onMidiInput(60, 80, true);
    expect(r.advanced).toBe(true);
    expect(r.result).toBe('HIT');
  });

  it('single-note steps are unaffected by chord window', () => {
    const engine = createV2Engine();
    engine.loadLesson(makeChordLesson([[60], [64]])); // two single notes
    engine.setMode('WAIT');

    const r1 = engine.onMidiInput(60, 80, true);
    expect(r1.advanced).toBe(true);

    vi.advanceTimersByTime(5000); // long wait — irrelevant for single notes

    const r2 = engine.onMidiInput(64, 80, true);
    expect(r2.advanced).toBe(true);
  });

  it('3-note chord requires all notes within window', () => {
    const engine = createV2Engine();
    engine.loadLesson(makeChordLesson([[60, 64, 67]])); // C major triad
    engine.setMode('WAIT');

    engine.onMidiInput(60, 80, true);
    vi.advanceTimersByTime(400);
    engine.onMidiInput(64, 80, true);
    vi.advanceTimersByTime(400);
    const r = engine.onMidiInput(67, 80, true);
    expect(r.advanced).toBe(true);
    expect(r.result).toBe('HIT');
  });

  it('3-note chord fails if third note comes after window from first', () => {
    const engine = createV2Engine();
    engine.loadLesson(makeChordLesson([[60, 64, 67]]));
    engine.setMode('WAIT');

    engine.onMidiInput(60, 80, true); // t=0
    vi.advanceTimersByTime(500);
    engine.onMidiInput(64, 80, true); // t=500
    vi.advanceTimersByTime(2000); // t=2500 — window from first note (t=0) expired
    const r = engine.onMidiInput(67, 80, true);
    // Window expired, state reset — 67 starts fresh partial
    expect(r.advanced).toBe(false);
  });

  it('step quality tracks chord timeout as soft error', () => {
    const engine = createV2Engine();
    engine.setUseStepQuality(true);
    engine.loadLesson(makeChordLesson([[60, 64]]));
    engine.setMode('WAIT');

    // Partial → timeout → retry → complete
    engine.onMidiInput(60, 80, true);
    vi.advanceTimersByTime(3000);
    // After timeout, play both correctly
    engine.onMidiInput(60, 80, true);
    vi.advanceTimersByTime(100);
    const r = engine.onMidiInput(64, 80, true);
    expect(r.advanced).toBe(true);

    // The timeout should have recorded as a soft error (not hard)
    const qualities = engine.getStepQualities();
    expect(qualities.length).toBe(1);
    // With a soft error from timeout, quality should be GREAT or lower, not PERFECT
    expect(qualities[0]).not.toBe('PERFECT');
  });

  it('FILM mode is unaffected (has its own timing)', () => {
    const engine = createV2Engine();
    engine.loadLesson(makeChordLesson([[60, 64]]));
    engine.setMode('FILM');

    // FILM uses tickFilm + judgeFilmNoteOn, not onMidiInput for advancing
    // Just verify onMidiInput returns NONE in FILM (it uses different path)
    const r = engine.onMidiInput(60, 80, true);
    // In FILM mode, onMidiInput still works but film has its own activation
    // The chord window only matters for WAIT mode stepState accumulation
    // This test just ensures no crash
    expect(r).toBeDefined();
  });
});
