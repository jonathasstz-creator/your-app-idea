import { LessonContentPacket, LessonNote, LessonStepV2 } from '../types';

export interface TransposeOptions {
    semitones: number;          // Range: -12 to +12
    preferFlats?: boolean;      // Derived from target key signature, but overridable
    clampToMidiRange?: boolean; // Default: true — protection against overflow
}

export type TransposeWarning =
    | { type: 'MIDI_OVERFLOW'; noteCount: number }    // notes adjusted by octave
    | { type: 'FINGERINGS_INVALIDATED' }               // fingerings are now invalid
    | { type: 'ENHARMONIC_AMBIGUITY'; key: string };   // D# vs Eb was resolved automatically

export interface TransposeResult {
    lesson: LessonContentPacket;        // Immutable clone, never mutation
    warnings: TransposeWarning[];       // Warnings that the UI should display
}

export class LessonTransposer {
    /**
     * Clamps MIDI to valid piano range (21 to 108).
     * If out of bounds, shifts by octaves until it fits.
     */
    public static clampMidi(midi: number, delta: number): { midi: number; clamped: boolean } {
        let transposed = midi + delta;
        let clamped = false;

        // Shift down by octave if too high
        while (transposed > 108) {
            transposed -= 12;
            clamped = true;
        }

        // Shift up by octave if too low
        while (transposed < 21) {
            transposed += 12;
            clamped = true;
        }

        return { midi: transposed, clamped };
    }

    /**
     * Transposes a lesson packet immutably.
     */
    public static transpose(originalLesson: Readonly<LessonContentPacket>, opts: TransposeOptions): TransposeResult {
        const semitones = opts.semitones || 0;
        const warnings: TransposeWarning[] = [];

        // If 0 semitones, return exactly the same object (reference) to avoid React re-renders or clone cost
        if (semitones === 0) {
            return { lesson: originalLesson as LessonContentPacket, warnings };
        }

        // Defensive deep clone of the lesson structure
        const lesson: LessonContentPacket = JSON.parse(JSON.stringify(originalLesson));
        const clampToMidiRange = opts.clampToMidiRange ?? true;
        let overflowCount = 0;

        // Transpose V1 Notes
        if (lesson.notes && Array.isArray(lesson.notes)) {
            lesson.notes = lesson.notes.map((note: LessonNote) => {
                let newMidi = note.midi + semitones;
                if (clampToMidiRange) {
                    const clamped = this.clampMidi(note.midi, semitones);
                    newMidi = clamped.midi;
                    if (clamped.clamped) overflowCount++;
                }
                return { ...note, midi: newMidi };
            });
        }

        // Transpose V2 Steps
        if (lesson.steps && Array.isArray(lesson.steps)) {
            lesson.steps = lesson.steps.map((step: LessonStepV2) => {
                const newNotes = step.notes.map((midi: number) => {
                    let newMidi = midi + semitones;
                    if (clampToMidiRange) {
                        const clamped = this.clampMidi(midi, semitones);
                        newMidi = clamped.midi;
                        if (clamped.clamped) overflowCount++;
                    }
                    return newMidi;
                });
                return { ...step, notes: newNotes };
            });
        }

        if (overflowCount > 0) {
            warnings.push({ type: 'MIDI_OVERFLOW', noteCount: overflowCount });
        }

        return { lesson, warnings };
    }
}
