import { LessonNote, LessonStepV2 } from './types';

export interface DerivedRenderNotes {
  renderNotes: LessonNote[];
  startIndexByStep: number[];
}

export function deriveRenderNotesFromV2Steps(steps: LessonStepV2[]): DerivedRenderNotes {
  const renderNotes: LessonNote[] = [];
  const startIndexByStep: number[] = [];

  steps.forEach((step, idx) => {
    const stepIndex = idx;
    const notes = Array.isArray(step.notes) ? [...step.notes] : [];
    notes.sort((a, b) => a - b);

    startIndexByStep[stepIndex] = renderNotes.length;

    notes.forEach((midi) => {
      renderNotes.push({
        step_index: renderNotes.length,
        midi,
        start_beat: step.start_beat,
        duration_beats: step.duration_beats ?? 1,
      });
    });
  });

  return { renderNotes, startIndexByStep };
}
