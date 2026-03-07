/**
 * Catalog Service
 *
 * Centralized catalog management with caching to prevent duplicate HTTP requests.
 * Handles both REST and WebSocket transport modes.
 *
 * IMPORTANT: The navigation (TrailNavigator) is powered by the BACKEND catalog.
 * `assets/lessons.json` is NO LONGER used as the primary source for navigation.
 * The adapter in `catalog/adapter.ts` converts the flat backend response into
 * the hierarchical Trail[] structure expected by the UI.
 */

import type { ITransport } from './transport/factory';
import type { Trail, TrailChapter } from './catalog/types';
import { adaptCatalogToTrails } from './catalog/adapter';

export interface CatalogResponse {
    api_version?: string;
    tracks?: any[];
    chapters?: Array<{
        chapter_id: number | string;
        track_id?: string | number | null;
        default_lesson_id?: string;
        title?: string;
        subtitle?: string;
        order?: number;
        status?: string;
        lessons?: Array<{ lesson_id: string; title?: string; order?: number }>;
    }>;
    lessons?: Array<{
        lesson_id: string;
        chapter_id?: number | string;
        title?: string;
        order?: number;
    }>;
}

export class CatalogService {
    private catalog: CatalogResponse | null = null;
    private loading: boolean = false;
    private loadPromise: Promise<CatalogResponse> | null = null;
    private chapterToLessonMap = new Map<number, string>();

    // Trail data derived from backend catalog (NOT from static lessons.json)
    private backendTrails: Trail[] = [];
    private trailChapterById = new Map<number, TrailChapter>();

    /**
     * Returns all trails derived from the backend catalog.
     * Falls back to empty array if catalog hasn't been loaded yet.
     *
     * NOTE: This NO LONGER reads from assets/lessons.json.
     * The backend is the single source of truth for navigation.
     */
    getTrails(): Trail[] {
        if (this.backendTrails.length === 0 && !this.catalog) {
            console.warn('[CatalogService] ⚠️ getTrails() called before catalog loaded — returning empty');
        }
        return this.backendTrails;
    }

    /** Returns trail chapter metadata by ID (from backend catalog) */
    getTrailChapter(chapterId: number): TrailChapter | undefined {
        return this.trailChapterById.get(chapterId);
    }

    /**
     * Load catalog from transport (with caching)
     * After loading, automatically builds the Trail[] hierarchy from backend data.
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
                this.buildTrailsFromBackend(catalog);
                console.log('[CatalogService] ✅ Catalog loaded successfully', {
                    tracks: catalog.tracks?.length ?? 0,
                    chapters: catalog.chapters?.length ?? 0,
                    lessons: catalog.lessons?.length ?? 0,
                    mappings: this.chapterToLessonMap.size,
                    trails: this.backendTrails.length,
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
        this.backendTrails = [];
        this.trailChapterById.clear();
        this.loading = false;
        this.loadPromise = null;
        console.log('[CatalogService] Cache cleared');
    }

    /**
     * Build Trail[] hierarchy from backend catalog data.
     * This is the ONLY source of truth for TrailNavigator.
     */
    private buildTrailsFromBackend(catalog: CatalogResponse): void {
        this.backendTrails = adaptCatalogToTrails(catalog);
        this.trailChapterById.clear();

        // Index all trail chapters for quick lookup
        for (const trail of this.backendTrails) {
            for (const level of trail.levels ?? []) {
                for (const mod of level.modules ?? []) {
                    for (const ch of mod.chapters ?? []) {
                        this.trailChapterById.set(ch.chapter_id, ch);
                    }
                }
            }
        }

        console.log('[CatalogService] Built trails from backend:', {
            trails: this.backendTrails.length,
            indexedChapters: this.trailChapterById.size,
        });
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
