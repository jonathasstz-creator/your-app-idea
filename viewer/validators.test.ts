import { describe, it, expect } from 'vitest';
import { validateLessonContent } from './validators';

describe('Lesson Validator', () => {
    it('should validate valid V2 payload', () => {
        const v2Payload = {
            type: 'lesson_content',
            schema_version: 2,
            session_id: 'sess-123',
            lesson_id: 'lesson-abc',
            bpm: 120,
            total_steps: 10,
            notes: [], // V2 might have empty notes array or just be ignored
            steps: [
                {
                    step_index: 0,
                    start_beat: 0,
                    duration_beats: 1,
                    notes: [60, 64, 67] // Chord
                },
                {
                    step_index: 1,
                    start_beat: 1,
                    duration_beats: 1,
                    notes: [62]
                }
            ]
        };

        const result = validateLessonContent(v2Payload);
        expect(result.schema_version).toBe(2);
        if (result.schema_version === 2) {
            expect(result.steps).toHaveLength(2);
            expect(result.steps[0].notes).toEqual([60, 64, 67]);
        }
    });

    it('should default to V1 if schema_version is missing', () => {
        const v1Payload = {
            type: 'lesson_content',
            // schema_version missing
            session_id: 'sess-123',
            lesson_id: 'lesson-abc',
            bpm: 120,
            total_steps: 5,
            notes: [
                {
                    step_index: 0,
                    midi: 60,
                    start_beat: 0,
                    duration_beats: 1
                }
            ]
        };

        const result = validateLessonContent(v1Payload);
        expect(result.schema_version).toBe(1);
    });

    it('should fail on invalid V2 payload (missing steps)', () => {
        const invalidPayload = {
            type: 'lesson_content',
            schema_version: 2,
            session_id: 'sess-123',
            lesson_id: 'lesson-abc',
            bpm: 120,
            total_steps: 10,
            notes: [],
            // steps missing
        };

        expect(() => validateLessonContent(invalidPayload)).toThrow();
    });
});
