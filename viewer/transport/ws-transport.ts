/**
 * WebSocket Transport Implementation
 * 
 * Extracted from index.tsx to maintain WebSocket functionality.
 * Provides real-time bidirectional communication with the backend.
 */

import type { ITransport, CatalogResponse, SessionResponse, LessonContent } from './transport';

const WS_RECONNECT_BASE_DELAY = 250;
const WS_RECONNECT_MAX_DELAY = 5000;

export type WsState = 'connecting' | 'connected' | 'disconnected';

export class WebSocketTransport implements ITransport {
    private socket: WebSocket | null = null;
    private outbox: Array<{ payload: unknown; dedupeKey?: string }> = [];
    private reconnectDelay = WS_RECONNECT_BASE_DELAY;
    private reconnectTimer: number | null = null;
    private messageListeners = new Map<string, Set<(data: any) => void>>();
    private resolvers = new Map<string, (data: any) => void>();

    constructor(
        private wsUrl: string,
        private onMessage?: (data: any) => void,
        private onStatusChange?: (state: WsState, reason?: string) => void
    ) { }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
                resolve();
                return;
            }

            this.clearReconnectTimer();
            console.log(`[WS] Connecting to ${this.wsUrl}`);
            this.onStatusChange?.('connecting');

            this.socket = new WebSocket(this.wsUrl);

            const onOpen = () => {
                console.log('[WS] Connected');
                this.onStatusChange?.('connected');
                this.reconnectDelay = WS_RECONNECT_BASE_DELAY;
                this.sendHelloRole();
                this.flushOutbox();
                resolve();
            };

            const onError = (error: Event) => {
                console.error('[WS] Connection error:', error);
                this.onStatusChange?.('disconnected', 'error');
                reject(new Error('WebSocket connection failed'));
            };

            this.socket.addEventListener('open', onOpen);
            this.socket.addEventListener('error', onError);
            this.socket.addEventListener('message', this.handleMessage);
            this.socket.addEventListener('close', this.handleClose);
        });
    }

    disconnect(): void {
        console.log('[WS] Disconnecting');
        this.clearReconnectTimer();
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }

    isConnected(): boolean {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    async getCatalog(): Promise<CatalogResponse> {
        console.log('[WS] Requesting catalog');
        return this.sendAndWait({ type: 'chapter_catalog_request', version: 1 }, 'chapter_catalog');
    }

    async startChapter(chapterId: string): Promise<SessionResponse> {
        console.log('[WS] Starting chapter:', chapterId);
        return this.sendAndWait(
            {
                type: 'start_chapter',
                chapter_id: chapterId,
                mode: 'WAIT',
            },
            'lesson_content'
        );
    }

    async getLesson(sessionId: string): Promise<LessonContent> {
        console.log('[WS] Getting lesson for session:', sessionId);
        // In WebSocket mode, lesson content is typically pushed
        // This is a placeholder - actual implementation depends on protocol
        return Promise.resolve({
            session_id: sessionId,
            lesson_id: '',
        } as LessonContent);
    }

    async sendEvent(sessionId: string, event: any): Promise<void> {
        console.log('[WS] Sending event:', event.type);
        this.send(event);
    }

    // WebSocket-specific methods

    send(payload: unknown, options?: { dedupeKey?: string }): 'sent' | 'queued' {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.dispatch(payload);
            return 'sent';
        }

        const dedupeKey = options?.dedupeKey;
        if (dedupeKey && this.outbox.some((entry) => entry.dedupeKey === dedupeKey)) {
            return 'queued';
        }

        this.outbox.push({ payload, dedupeKey });
        this.connect(); // Try to connect if queued
        return 'queued';
    }

    onLessonUpdate(callback: (data: any) => void): void {
        this.registerListener('lesson_content', callback);
    }

    onNoteEvent(callback: (data: any) => void): void {
        this.registerListener('note_event', callback);
    }

    // Private methods

    private dispatch(payload: unknown) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        try {
            this.socket.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
        } catch (error) {
            console.error('[WS] Failed to send payload', error);
        }
    }

    private flushOutbox() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        const queue = [...this.outbox];
        this.outbox = [];
        queue.forEach((entry) => this.dispatch(entry.payload));
    }

    private sendHelloRole() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        this.dispatch({ type: 'hello', requested_role: 'ui' });
    }

    private handleMessage = (event: MessageEvent) => {
        try {
            const data = JSON.parse(event.data);
            const type = data?.type;

            // Log incoming message
            const chapterId = data?.chapter_id ?? data?.lesson_id ?? null;
            const scoreLen = data?.score_xml
                ? String(data.score_xml).length
                : data?.score?.xml_text?.length;
            const notesLen = Array.isArray(data?.notes)
                ? data.notes.length
                : Array.isArray(data?.lesson_notes)
                    ? data.lesson_notes.length
                    : undefined;

            console.log('[WS]', 'type=', type, 'chapter=', chapterId, 'score_len=', scoreLen, 'notes=', notesLen);

            // Call external message handler
            this.onMessage?.(data);

            // Notify type-specific listeners
            const listeners = this.messageListeners.get(type);
            if (listeners) {
                listeners.forEach((callback) => callback(data));
            }

            // Resolve pending promise
            const resolver = this.resolvers.get(type);
            if (resolver) {
                resolver(data);
                this.resolvers.delete(type);
            }
        } catch (error) {
            console.error('[WS] Parse error', error);
        }
    };

    private handleClose = () => {
        console.log('[WS] Disconnected');
        this.onStatusChange?.('disconnected');
        this.socket = null;
        this.scheduleReconnect();
    };

    private scheduleReconnect() {
        if (this.reconnectTimer !== null) return;

        const delay = this.reconnectDelay;
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, WS_RECONNECT_MAX_DELAY);

        console.log(`[WS] Scheduling reconnect in ${delay}ms`);
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            this.connect().catch((err) => console.error('[WS] Reconnect failed:', err));
        }, delay);
    }

    private clearReconnectTimer() {
        if (this.reconnectTimer !== null) {
            window.clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    private registerListener(type: string, callback: (data: any) => void): void {
        if (!this.messageListeners.has(type)) {
            this.messageListeners.set(type, new Set());
        }
        this.messageListeners.get(type)!.add(callback);
    }

    private sendAndWait(message: any, responseType: string): Promise<any> {
        return new Promise((resolve) => {
            this.resolvers.set(responseType, resolve);
            this.send(message);
        });
    }
}
