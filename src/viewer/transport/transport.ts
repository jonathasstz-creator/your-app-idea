/**
 * Transport Layer Abstraction
 * 
 * Defines the interface for both REST and WebSocket communication modes.
 * This allows the viewer to work with either transport mechanism seamlessly.
 */

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

export interface SessionResponse {
    session_id: string;
    lesson_id: string;
    chapter_id?: string | number;
    bpm?: number;
    created_at?: number;
}

export interface LessonContent {
    type?: 'lesson_content';
    session_id: string;
    lesson_id: string;
    chapter_id?: string | number;
    lesson_version?: number;
    schema_version?: 1 | 2;
    bpm?: number;
    beats_per_measure?: number;
    count_in_beats?: number;
    total_steps?: number;
    score?: { xml_text?: string };
    score_xml?: string;
    notes?: any[];
    steps?: any[];
    steps_json?: any[];
    evaluation?: {
        hit_window_ms?: number;
        late_miss_ms?: number;
        early_accept_ms?: number;
    };
}

/**
 * Abstract transport interface
 * Both REST and WebSocket implementations must fulfill this contract
 */
export interface ITransport {
    /**
     * Establish connection to the backend
     * For REST: validates API availability
     * For WebSocket: opens WebSocket connection
     */
    connect(): Promise<void>;

    /**
     * Close connection gracefully
     */
    disconnect(): void;

    /**
     * Check if transport is ready for communication
     */
    isConnected(): boolean;

    /**
     * Fetch the lesson catalog
     */
    getCatalog(): Promise<CatalogResponse>;

    /**
     * Start a chapter and create a session
     * @param chapterId - The chapter ID to start
     */
    startChapter(chapterId: string): Promise<SessionResponse>;

    /**
     * Get lesson content for a session
     * @param sessionId - The session ID
     */
    getLesson(sessionId: string): Promise<LessonContent>;

    /**
     * Send an event to the backend
     * @param sessionId - The session ID
     * @param event - The event payload
     */
    sendEvent(sessionId: string, event: any): Promise<void>;

    /**
     * Send raw payload (WebSocket-specific)
     * Optional method only available in WebSocket mode
     */
    send?(payload: unknown, options?: { dedupeKey?: string }): "sent" | "queued";

    /**
     * Register listener for real-time lesson updates (WebSocket-specific)
     * Optional feature not available in REST mode
     */
    onLessonUpdate?(callback: (data: any) => void): void;

    /**
     * Register listener for note events (WebSocket-specific)
     * Optional feature not available in REST mode
     */
    onNoteEvent?(callback: (data: any) => void): void;
}

export type TransportMode = 'rest' | 'websocket';

/**
 * Type guard to check if transport supports WebSocket features
 */
export function isWebSocketTransport(transport: ITransport): transport is ITransport & Required<Pick<ITransport, 'send' | 'onLessonUpdate' | 'onNoteEvent'>> {
    return typeof transport.send === 'function';
}
