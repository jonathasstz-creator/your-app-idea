import { z } from 'zod';

// V1 Schema: Monophonic
export const LessonNoteV1Schema = z.object({
    step_index: z.number().int().nonnegative(),
    midi: z.number().int().min(0).max(127),
    start_beat: z.number(),
    duration_beats: z.number().positive(),
    staff: z.string().nullable().optional(),
    measure_index: z.number().nullable().optional(),
    beat: z.number().nullable().optional(),
}).passthrough();  // Allow extra fields

export const LessonContentV1Schema = z.object({
    type: z.literal('lesson_content'),
    schema_version: z.literal(1),
    session_id: z.string(),
    lesson_id: z.string(),
    bpm: z.number().positive(),
    total_steps: z.number(),
    notes: z.array(LessonNoteV1Schema),
    steps: z.any().optional(),  // V1 may not have steps
}).passthrough();

// V2 Schema: Polyphonic
export const LessonStepV2Schema = z.object({
    step_index: z.number().int().nonnegative().optional(),
    start_beat: z.number(),
    duration_beats: z.number().positive().optional(),
    notes: z.array(z.number().int().min(0).max(127)),
    staff: z.number().optional(),
    voice: z.number().optional(),
}).passthrough();

export const LessonContentV2Schema = z.object({
    type: z.literal('lesson_content'),
    schema_version: z.literal(2),
    session_id: z.string(),
    lesson_id: z.string(),
    bpm: z.number().positive(),
    total_steps: z.number(),
    notes: z.array(z.any()).optional(),
    steps: z.array(LessonStepV2Schema),
}).passthrough();

// Preprocessor: normalize schema_version before validation
export const LessonContentSchema = z.preprocess(
    (data: any) => {
        if (!data || typeof data !== 'object') return data;

        // Default to V1 if schema_version is missing
        if (data.schema_version === undefined || data.schema_version === null) {
            return { ...data, schema_version: 1 };
        }

        // Convert string to number
        if (typeof data.schema_version === 'string') {
            const parsed = parseInt(data.schema_version, 10);
            if (Number.isFinite(parsed)) {
                return { ...data, schema_version: parsed };
            }
            return data;
        }

        return data;
    },
    z.discriminatedUnion('schema_version', [LessonContentV1Schema, LessonContentV2Schema])
);

export type LessonContentV1 = z.infer<typeof LessonContentV1Schema>;
export type LessonContentV2 = z.infer<typeof LessonContentV2Schema>;
export type LessonContent = z.infer<typeof LessonContentSchema>;

export function validateLessonContent(data: unknown): LessonContent {
    const result = LessonContentSchema.safeParse(data);

    if (!result.success) {
        console.error('[VALIDATOR] ❌ Lesson content validation failed:', result.error.format());
        throw new Error(`Invalid lesson schema: ${JSON.stringify(result.error.issues, null, 2)}`);
    }

    console.log(`[VALIDATOR] ✅ Schema V${result.data.schema_version} validated`);
    return result.data;
}
