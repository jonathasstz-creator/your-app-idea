/**
 * Backend Catalog → Trail Adapter
 *
 * Converts the flat backend catalog response (tracks[], chapters[], lessons[])
 * into the hierarchical Trail[] structure expected by TrailNavigator.
 *
 * Mapping rules:
 *   - Each backend `track` becomes a `Trail`
 *   - Each trail gets a single synthetic Level
 *   - Each level gets a single synthetic Module
 *   - Chapters matching that track's `track_id` are placed inside the module
 *   - Chapters are ordered by their `order` field (then chapter_id as tiebreaker)
 *   - Chapters with multiple lessons (uploads) expose all lessons as sub-items
 *   - Chapters without a track_id go into an "Outros" catch-all trail
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
    const chaptersByTrack = new Map<string, TrailChapter[]>();
    const orphanChapters: TrailChapter[] = [];

    for (const ch of chapters) {
        const chId = normalizeId(ch.chapter_id);
        if (chId === null) continue;

        const trailChapter: TrailChapter = {
            chapter_id: chId,
            title: ch.title,
            subtitle: ch.subtitle,
            default_lesson_id: ch.default_lesson_id,
            status: ch.status,
            lessons: lessonsByChapter.get(chId)?.map(l => ({
                lesson_id: l.lesson_id,
                title: l.title,
            })),
        };

        const trackKey = ch.track_id != null ? String(ch.track_id) : null;
        if (trackKey) {
            if (!chaptersByTrack.has(trackKey)) chaptersByTrack.set(trackKey, []);
            chaptersByTrack.get(trackKey)!.push(trailChapter);
        } else {
            orphanChapters.push(trailChapter);
        }
    }

    // Sort chapters within each track by order, then chapter_id
    const sortChapters = (arr: TrailChapter[]) =>
        arr.sort((a, b) => {
            const orderA = (a as any)._order ?? 0;
            const orderB = (b as any)._order ?? 0;
            if (orderA !== orderB) return orderA - orderB;
            return a.chapter_id - b.chapter_id;
        });

    // Store order temporarily for sorting
    for (const ch of chapters) {
        const chId = normalizeId(ch.chapter_id);
        if (chId === null) continue;
        // Find the TrailChapter and attach order for sorting
        const allGroups = [...chaptersByTrack.values(), orphanChapters];
        for (const group of allGroups) {
            const found = group.find(tc => tc.chapter_id === chId);
            if (found) (found as any)._order = ch.order ?? 0;
        }
    }

    // Build trails from tracks
    const sortedTracks = [...tracks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const trails: Trail[] = [];

    for (const track of sortedTracks) {
        const trackKey = String(track.track_id);
        const trackChapters = chaptersByTrack.get(trackKey) ?? [];
        if (trackChapters.length === 0) continue;

        sortChapters(trackChapters);
        // Clean up temp _order
        trackChapters.forEach(tc => delete (tc as any)._order);

        const module: TrailModule = {
            title: track.title ?? `Track ${track.track_id}`,
            chapters: trackChapters,
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
        sortChapters(orphanChapters);
        orphanChapters.forEach(tc => delete (tc as any)._order);

        trails.push({
            trail_id: '_other',
            title: 'Outros',
            levels: [{
                title: 'Outros',
                modules: [{
                    title: 'Capítulos',
                    chapters: orphanChapters,
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
