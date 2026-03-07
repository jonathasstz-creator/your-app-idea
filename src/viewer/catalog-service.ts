/**
 * Catalog Service
 *
 * Centralized catalog management with caching to prevent duplicate HTTP requests.
 * Handles both REST and WebSocket transport modes.
 *
 * Also indexes static trails[] from lessons.json for the TrailNavigator UI.
 */

import type { ITransport } from './transport/factory';
import type { Trail, TrailChapter } from './catalog/types';
import lessonsJson from '../../assets/lessons.json';

export interface CatalogResponse {
    api_version?: string;
    tracks?: any[];
    chapters?: Array<{
        chapter_id: number | string;
        default_lesson_id?: string;
        title?: string;
        subtitle?: string;
    }>;
    lessons?: Array<{
        lesson_id: string;
        chapter_id?: number | string;
    }>;
}

export class CatalogService {
    private catalog: CatalogResponse | null = null;
    private loading: boolean = false;
    private loadPromise: Promise<CatalogResponse> | null = null;
    private chapterToLessonMap = new Map<number, string>();

    // Trail data indexed from static lessons.json (no backend needed)
    private trailChapterById = new Map<number, TrailChapter>();

    constructor() {
        this.indexStaticTrails();
    }

    /** Index trail chapters from static lessons.json for TrailNavigator */
    private indexStaticTrails(): void {
        const json = lessonsJson as unknown as { trails?: Trail[] };
        for (const trail of json.trails ?? []) {
            for (const level of trail.levels ?? []) {
                for (const mod of level.modules ?? []) {
                    for (const ch of mod.chapters ?? []) {
                        this.trailChapterById.set(ch.chapter_id, ch as TrailChapter);
                    }
                }
            }
        }
    }

    /** Returns all trails defined in lessons.json */
    getTrails(): Trail[] {
        const json = lessonsJson as unknown as { trails?: Trail[] };
        const trails = json.trails ?? [];
        if (!trails.length) {
            console.warn('[CatalogService] ⚠️ getTrails() returned empty — lessons.json has no trails[] or import failed');
        }
        return trails;
    }

    /** Returns trail chapter metadata by ID (chapters 101+) */
    getTrailChapter(chapterId: number): TrailChapter | undefined {
        return this.trailChapterById.get(chapterId);
    }

    /**
     * Load catalog from transport (with caching)
     * @param transport - The transport instance to use
     * @returns Promise resolving to catalog data
     */
    async load(transport: ITransport): Promise<CatalogResponse> {
        // Return cached catalog if available
        if (this.catalog) {
            console.log('[CatalogService] Using cached catalog');
            return this.catalog;
        }

        // Return in-flight promise if already loading
        if (this.loading && this.loadPromise) {
            console.log('[CatalogService] Reusing in-flight catalog request');
            return this.loadPromise;
        }

        // Start new load
        this.loading = true;
        console.log('[CatalogService] Loading catalog from transport...');

        this.loadPromise = transport.getCatalog()
            .then(catalog => {
                this.catalog = catalog;
                this.buildChapterLessonMap(catalog);
                console.log('[CatalogService] ✅ Catalog loaded successfully', {
                    chapters: catalog.chapters?.length ?? 0,
                    lessons: catalog.lessons?.length ?? 0,
                    mappings: this.chapterToLessonMap.size
                });
                return catalog;
            })
            .catch(error => {
                console.error('[CatalogService] ❌ Failed to load catalog:', error);
                throw error;
            })
            .finally(() => {
                this.loading = false;
            });

        return this.loadPromise;
    }

    /**
     * Get cached catalog (returns null if not loaded)
     */
    getCatalog(): CatalogResponse | null {
        return this.catalog;
    }

    /**
     * Check if catalog is loaded and ready
     */
    isReady(): boolean {
        return this.catalog !== null;
    }

    /**
     * Check if catalog is currently loading
     */
    isLoading(): boolean {
        return this.loading;
    }

    /**
     * Get lesson ID for a given chapter ID
     * @param chapterId - The chapter ID (number or string)
     * @returns The lesson ID or null if not found
     */
    getChapterLessonId(chapterId: number | string): string | null {
        const normalized = this.normalizeChapterKey(chapterId);
        if (normalized === null) return null;

        const lessonId = this.chapterToLessonMap.get(normalized);
        if (lessonId) return lessonId;

        // Special chapters that resolve to lesson_{id} without backend catalog:
        //   4        — polyphonic intro
        //   23       — chord practice
        //   31-45    — polyphonic series
        //   99       — sandbox/test
        //   100+     — trail chapters (from lessons.json)
        const isSpecialChapter =
            normalized === 4 ||
            normalized === 23 ||
            (normalized >= 31 && normalized <= 45) ||
            normalized === 99 ||
            normalized >= 100;
        if (isSpecialChapter) return `lesson_${normalized}`;

        return null;
    }

    /**
     * Clear cached catalog (useful for testing or forcing refresh)
     */
    clear(): void {
        this.catalog = null;
        this.chapterToLessonMap.clear();
        this.loading = false;
        this.loadPromise = null;
        console.log('[CatalogService] Cache cleared');
    }

    /**
     * Build internal chapter → lesson mapping from catalog data
     */
    private buildChapterLessonMap(catalog: CatalogResponse): void {
        this.chapterToLessonMap.clear();

        // First pass: use default_lesson_id from chapters
        if (Array.isArray(catalog.chapters)) {
            catalog.chapters.forEach(chapter => {
                const chapterKey = this.normalizeChapterKey(chapter.chapter_id);
                const defaultLesson = typeof chapter.default_lesson_id === 'string'
                    ? chapter.default_lesson_id.trim()
                    : '';

                if (chapterKey !== null && defaultLesson) {
                    this.chapterToLessonMap.set(chapterKey, defaultLesson);
                }
            });
        }

        // Second pass: fallback to lessons array for missing mappings
        if (Array.isArray(catalog.lessons)) {
            catalog.lessons.forEach(lesson => {
                const chapterKey = this.normalizeChapterKey(lesson.chapter_id);

                // Only set if not already mapped (chapters take priority)
                if (chapterKey !== null && lesson.lesson_id && !this.chapterToLessonMap.has(chapterKey)) {
                    this.chapterToLessonMap.set(chapterKey, lesson.lesson_id);
                }
            });
        }

        console.log('[CatalogService] Built chapter→lesson mapping:',
            Array.from(this.chapterToLessonMap.entries()).slice(0, 5));
    }

    /**
     * Normalize chapter ID to a consistent number format
     */
    private normalizeChapterKey(value: unknown): number | null {
        if (value == null) return null;

        const text = String(value);
        const digits = text.replace(/\D/g, '');

        if (digits) {
            const numeric = Number(digits);
            if (!Number.isNaN(numeric)) {
                return numeric;
            }
        }

        const fallback = Number(text);
        if (!Number.isNaN(fallback)) {
            return fallback;
        }

        return null;
    }
}
