/**
 * Catalog Service
 *
 * Centralized catalog management with caching.
 *
 * Data flow:
 *   1. If a transport (backend) is available: load from API → CatalogResponse
 *   2. Otherwise: use local catalog built from assets/lessons.json
 *   3. CatalogResponse → adaptCatalogToTrails() → Trail[] for TrailNavigator
 *
 * The backend is the preferred source of truth when available.
 * The local catalog serves as an offline fallback using the same pipeline.
 */

import type { ITransport } from './transport/factory';
import type { Trail, TrailChapter } from './catalog/types';
import { adaptCatalogToTrails, type BackendCatalogPayload } from './catalog/adapter';
import { buildLocalCatalog } from './catalog/local-catalog';

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
        difficulty?: string;
        description?: string;
        allowed_notes?: string[];
        hand?: string;
        skill_tags?: string[];
        badge?: string;
        prerequisites?: number[];
        coming_soon?: boolean;
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

    // Trail data derived from catalog (backend or local)
    private derivedTrails: Trail[] = [];
    private trailChapterById = new Map<number, TrailChapter>();

    // Whether the current catalog came from backend (true) or local fallback (false)
    private sourceIsBackend: boolean = false;

    constructor() {
        // Pre-load local catalog so getTrails() works immediately without backend
        this.loadLocalCatalog();
    }

    /**
     * Load catalog from local lessons.json via the normalized pipeline.
     * This gives immediate data without any network request.
     */
    private loadLocalCatalog(): void {
        const localCatalog = buildLocalCatalog();
        this.catalog = localCatalog as CatalogResponse;
        this.buildChapterLessonMap(this.catalog);
        this.buildTrailsFromCatalog(localCatalog);
        this.sourceIsBackend = false;
        console.log('[CatalogService] Loaded local catalog from lessons.json', {
            tracks: localCatalog.tracks?.length ?? 0,
            chapters: localCatalog.chapters?.length ?? 0,
            trails: this.derivedTrails.length,
        });
    }

    /**
     * Returns all trails derived from the catalog.
     * Works immediately with local data; updated when backend loads.
     */
    getTrails(): Trail[] {
        return this.derivedTrails;
    }

    /** Returns trail chapter metadata by ID */
    getTrailChapter(chapterId: number): TrailChapter | undefined {
        return this.trailChapterById.get(chapterId);
    }

    /** Whether the current catalog was loaded from a remote backend */
    isBackendSource(): boolean {
        return this.sourceIsBackend;
    }

    /**
     * Load catalog from transport (backend). Replaces local data on success.
     * On failure, local catalog remains active.
     */
    async load(transport: ITransport): Promise<CatalogResponse> {
        // If already loaded from backend, return cached
        if (this.catalog && this.sourceIsBackend) {
            console.log('[CatalogService] Using cached backend catalog');
            return this.catalog;
        }

        // Deduplicate in-flight requests
        if (this.loading && this.loadPromise) {
            console.log('[CatalogService] Reusing in-flight catalog request');
            return this.loadPromise;
        }

        this.loading = true;
        console.log('[CatalogService] Loading catalog from transport...');

        this.loadPromise = transport.getCatalog()
            .then(catalog => {
                this.catalog = catalog;
                this.sourceIsBackend = true;
                this.buildChapterLessonMap(catalog);
                this.buildTrailsFromCatalog(catalog as BackendCatalogPayload);
                console.log('[CatalogService] ✅ Backend catalog loaded', {
                    tracks: catalog.tracks?.length ?? 0,
                    chapters: catalog.chapters?.length ?? 0,
                    lessons: catalog.lessons?.length ?? 0,
                    mappings: this.chapterToLessonMap.size,
                    trails: this.derivedTrails.length,
                });
                return catalog;
            })
            .catch(error => {
                console.warn('[CatalogService] ⚠️ Backend load failed, keeping local catalog:', error);
                // Local catalog remains active — no throw needed for UI
                return this.catalog!;
            })
            .finally(() => {
                this.loading = false;
            });

        return this.loadPromise;
    }

    /** Get cached catalog (never null after construction) */
    getCatalog(): CatalogResponse | null {
        return this.catalog;
    }

    /** Catalog is always ready (local data loads synchronously) */
    isReady(): boolean {
        return this.catalog !== null;
    }

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

        // Special chapters that resolve to lesson_{id} without catalog:
        //   4        — polyphonic intro
        //   23       — chord practice
        //   31-45    — polyphonic series
        //   99       — sandbox/test
        //   100+     — trail chapters
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
     * Clear cached catalog and reload local data
     */
    clear(): void {
        this.catalog = null;
        this.chapterToLessonMap.clear();
        this.derivedTrails = [];
        this.trailChapterById.clear();
        this.loading = false;
        this.loadPromise = null;
        this.sourceIsBackend = false;
        console.log('[CatalogService] Cache cleared');
    }

    /**
     * Build Trail[] hierarchy from catalog data (backend or local).
     */
    private buildTrailsFromCatalog(catalog: BackendCatalogPayload): void {
        this.derivedTrails = adaptCatalogToTrails(catalog);
        this.trailChapterById.clear();

        for (const trail of this.derivedTrails) {
            for (const level of trail.levels ?? []) {
                for (const mod of level.modules ?? []) {
                    for (const ch of mod.chapters ?? []) {
                        this.trailChapterById.set(ch.chapter_id, ch);
                    }
                }
            }
        }
    }

    /**
     * Build internal chapter → lesson mapping from catalog data
     */
    private buildChapterLessonMap(catalog: CatalogResponse): void {
        this.chapterToLessonMap.clear();

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

        if (Array.isArray(catalog.lessons)) {
            catalog.lessons.forEach(lesson => {
                const chapterKey = this.normalizeChapterKey(lesson.chapter_id);
                if (chapterKey !== null && lesson.lesson_id && !this.chapterToLessonMap.has(chapterKey)) {
                    this.chapterToLessonMap.set(chapterKey, lesson.lesson_id);
                }
            });
        }
    }

    private normalizeChapterKey(value: unknown): number | null {
        if (value == null) return null;
        const text = String(value);
        const digits = text.replace(/\D/g, '');
        if (digits) {
            const numeric = Number(digits);
            if (!Number.isNaN(numeric)) return numeric;
        }
        const fallback = Number(text);
        if (!Number.isNaN(fallback)) return fallback;
        return null;
    }
}
