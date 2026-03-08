/**
 * Backend Catalog → Trail Adapter
 *
 * Converts the flat backend catalog response (tracks[], chapters[], lessons[])
 * into the hierarchical Trail[] structure expected by TrailNavigator.
 *
 * Mapping rules:
 *   - Each backend `track` becomes a `Trail` with a single Level + single Module
 *   - Chapters matching that track's `track_id` are placed inside the module
 *   - Chapters are ordered by their `order` field (then chapter_id as tiebreaker)
 *   - Chapters with multiple lessons (uploads) expose all lessons as sub-items
 *   - Chapters without a track_id go into an "Outros" catch-all trail
 *   - Extended metadata (difficulty, description, allowed_notes, hand, etc.)
 *     is passed through from BackendChapter to TrailChapter.
 */

import type { Trail, TrailChapter, TrailModule, TrailLevel } from './types';

/** Shape of a track coming from the backend /v1/catalog response */
export interface BackendTrack {
    track_id: string | number;
    title?: string;
    description?: string;
    order?: number;
}

/** Shape of a chapter coming from the backend /v1/catalog response */
export interface BackendChapter {
    chapter_id: number | string;
    track_id?: string | number | null;
    title?: string;
    subtitle?: string;
    default_lesson_id?: string;
    order?: number;
    unlocked?: boolean;
    status?: string;
    lessons?: BackendLesson[];
    // Extended navigation metadata
    difficulty?: string;
    description?: string;
    allowed_notes?: string[];
    hand?: string;
    skill_tags?: string[];
    badge?: string;
    prerequisites?: number[];
    coming_soon?: boolean;
}

/** Shape of a lesson coming from the backend /v1/catalog response */
export interface BackendLesson {
    lesson_id: string;
    chapter_id?: number | string;
    title?: string;
    order?: number;
}

export interface BackendCatalogPayload {
    tracks?: BackendTrack[];
    chapters?: BackendChapter[];
    lessons?: BackendLesson[];
}

/**
 * Convert a flat backend catalog into the Trail[] hierarchy for TrailNavigator.
 */
export function adaptCatalogToTrails(catalog: BackendCatalogPayload): Trail[] {
    const tracks = catalog.tracks ?? [];
    const chapters = catalog.chapters ?? [];
    const lessons = catalog.lessons ?? [];

    // Index lessons by chapter_id for upload/multi-lesson chapters
    const lessonsByChapter = new Map<number, BackendLesson[]>();
    for (const lesson of lessons) {
        const chId = normalizeId(lesson.chapter_id);
        if (chId === null) continue;
        if (!lessonsByChapter.has(chId)) lessonsByChapter.set(chId, []);
        lessonsByChapter.get(chId)!.push(lesson);
    }

    // Convert backend chapters into TrailChapters, grouped by track_id
    const chaptersByTrack = new Map<string, { tc: TrailChapter; order: number }[]>();
    const orphanChapters: { tc: TrailChapter; order: number }[] = [];

    for (const ch of chapters) {
        const chId = normalizeId(ch.chapter_id);
        if (chId === null) continue;

        const trailChapter: TrailChapter = {
            chapter_id: chId,
            title: ch.title,
            subtitle: ch.subtitle,
            default_lesson_id: ch.default_lesson_id,
            status: ch.status,
            lessons: ch.lessons?.map(l => ({
                lesson_id: l.lesson_id,
                title: l.title,
            })) ?? lessonsByChapter.get(chId)?.map(l => ({
                lesson_id: l.lesson_id,
                title: l.title,
            })),
            // Pass through extended metadata
            difficulty: ch.difficulty as TrailChapter['difficulty'],
            description: ch.description,
            allowed_notes: ch.allowed_notes,
            hand: ch.hand as TrailChapter['hand'],
            skill_tags: ch.skill_tags,
            badge: ch.badge,
            prerequisites: ch.prerequisites,
            coming_soon: ch.coming_soon,
        };

        const entry = { tc: trailChapter, order: ch.order ?? 0 };
        const trackKey = ch.track_id != null ? String(ch.track_id) : null;
        if (trackKey) {
            if (!chaptersByTrack.has(trackKey)) chaptersByTrack.set(trackKey, []);
            chaptersByTrack.get(trackKey)!.push(entry);
        } else {
            orphanChapters.push(entry);
        }
    }

    // Sort helper
    const sortEntries = (arr: { tc: TrailChapter; order: number }[]) =>
        arr.sort((a, b) => {
            if (a.order !== b.order) return a.order - b.order;
            return a.tc.chapter_id - b.tc.chapter_id;
        });

    // Build trails from tracks
    const sortedTracks = [...tracks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const trails: Trail[] = [];

    for (const track of sortedTracks) {
        const trackKey = String(track.track_id);
        const entries = chaptersByTrack.get(trackKey) ?? [];
        if (entries.length === 0) continue;

        sortEntries(entries);

        const module: TrailModule = {
            title: track.title ?? `Track ${track.track_id}`,
            chapters: entries.map(e => e.tc),
        };

        const level: TrailLevel = {
            title: track.title ?? `Track ${track.track_id}`,
            modules: [module],
        };

        trails.push({
            trail_id: trackKey,
            title: track.title ?? `Track ${track.track_id}`,
            levels: [level],
        });
    }

    // Add orphan chapters as "Outros" trail if any exist
    if (orphanChapters.length > 0) {
        sortEntries(orphanChapters);

        trails.push({
            trail_id: '_other',
            title: 'Outros',
            levels: [{
                title: 'Outros',
                modules: [{
                    title: 'Capítulos',
                    chapters: orphanChapters.map(e => e.tc),
                }],
            }],
        });
    }

    return trails;
}

function normalizeId(value: unknown): number | null {
    if (value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
