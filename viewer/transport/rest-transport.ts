/**
 * REST API Transport Implementation
 * 
 * Communicates with the backend via HTTP REST API.
 * Uses fetch API with authentication headers.
 */

import type { ITransport, CatalogResponse, SessionResponse, LessonContent } from './transport';
import { getAuthTokenFromStorage, clearAuthStorage } from '../auth-storage';

export class RestTransport implements ITransport {
    private baseUrl: string;
    private connected: boolean = false;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    }

    async connect(): Promise<void> {
        // Trust the configured base URL without validation
        // Catalog will be loaded on-demand by CatalogService
        this.connected = true;
        console.log('[REST] Connected to', this.baseUrl);
    }

    disconnect(): void {
        this.connected = false;
        console.log('[REST] Disconnected');
    }

    isConnected(): boolean {
        return this.connected;
    }

    async getCatalog(): Promise<CatalogResponse> {
        console.log('[REST] Fetching catalog');
        const response = await this.fetchWithAuth('/catalog');
        return response;
    }

    async startChapter(chapterId: string): Promise<SessionResponse> {
        console.log('[REST] Starting chapter:', chapterId);

        // First, get catalog to map chapter to lesson
        const catalog = await this.getCatalog();

        // Normalize chapter ID
        const chapterKey = this.normalizeChapterKey(chapterId);

        // Find lesson ID for this chapter
        let lessonId: string | null = null;

        if (Array.isArray(catalog.chapters)) {
            const chapter = catalog.chapters.find(c =>
                this.normalizeChapterKey(c.chapter_id) === chapterKey
            );
            if (chapter?.default_lesson_id) {
                lessonId = chapter.default_lesson_id;
            }
        }

        if (!lessonId && Array.isArray(catalog.lessons)) {
            const lesson = catalog.lessons.find(l =>
                this.normalizeChapterKey(l.chapter_id) === chapterKey
            );
            if (lesson?.lesson_id) {
                lessonId = lesson.lesson_id;
            }
        }

        if (!lessonId) {
            // Fallback: try using chapter ID as lesson ID
            lessonId = `lesson_${chapterId}`;
        }

        console.log('[REST] Using lesson_id:', lessonId);

        // Create session
        const sessionPayload = {
            lesson_id: lessonId,
            client: {
                role: 'ui',
                platform: 'web-viewer',
                version: '1.0.0',
                caps: [1, 2], // Support both schema versions
            },
            session_config: {
                mode: 'WAIT',
                tempo_scale: 1.0,
                hit_window_ms: 200,
            },
        };

        const session = await this.fetchWithAuth('/sessions', {
            method: 'POST',
            body: JSON.stringify(sessionPayload),
        });

        console.log('[REST] Session created:', session.session_id);
        return session;
    }

    async getLesson(sessionId: string): Promise<LessonContent> {
        console.log('[REST] Fetching lesson for session:', sessionId);
        const lesson = await this.fetchWithAuth(`/sessions/${sessionId}/lesson`);
        return lesson;
    }

    async sendEvent(sessionId: string, event: any): Promise<void> {
        console.log('[REST] Sending event for session:', sessionId, 'type:', event.type);
        await this.fetchWithAuth(`/sessions/${sessionId}/events`, {
            method: 'POST',
            body: JSON.stringify({ events: [event] }),
        });
    }

    // Private helper methods

    private async fetchWithAuth(path: string, options: RequestInit = {}): Promise<any> {
        const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;

        const headers = new Headers(options.headers ?? {});
        headers.set('Accept', 'application/json');

        if (options.body && !headers.has('Content-Type')) {
            headers.set('Content-Type', 'application/json');
        }

        // Add authentication headers
        const authHeaders = this.buildHeaders();
        authHeaders.forEach((value, key) => {
            if (!headers.has(key)) {
                headers.set(key, value);
            }
        });

        const response = await fetch(url, {
            ...options,
            headers,
            credentials: 'omit',
        });

        if (response.status === 401) {
            clearAuthStorage();
            window.location.reload();
            throw new Error('401 Unauthorized - token inválido, recarregando para login');
        }

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            const error: any = new Error(
                `REST request failed (${response.status}): ${errorText}`
            );
            error.status = response.status;
            error.body = errorText;
            error.url = url;
            throw error;
        }

        return response.json();
    }

    private buildHeaders(): Headers {
        const headers = new Headers();

        // Require bearer token; no local UUID fallback
        const token = getAuthTokenFromStorage();
        if (!token) {
            throw new Error('Auth token missing. Faça login para continuar.');
        }
        headers.set('Authorization', `Bearer ${token}`);
        return headers;
    }

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
