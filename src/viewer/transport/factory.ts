/**
 * Transport Factory
 * 
 * Automatically selects the appropriate transport mode based on environment configuration.
 * 
 * Selection strategy:
 * 1. Check VITE_USE_WEBSOCKET env var (explicit override)
 * 2. Check VITE_API_BASE_URL for port number
 *    - Port 8002 → REST
 *    - Port 8001 → WebSocket
 * 3. Default to REST
 */

import type { ITransport } from './transport';
import { RestTransport } from './rest-transport';
import { WebSocketTransport, type WsState } from './ws-transport';
import { getConfig } from '../../config/app-config';

// Re-export types for convenience
export type { ITransport } from './transport';

export function createTransport(
    onMessage?: (data: any) => void,
    onStatusChange?: (state: WsState, reason?: string) => void
): ITransport {
    // 1. Check for explicit WebSocket mode
    const forceWebSocket = (import.meta as any).env?.VITE_USE_WEBSOCKET === 'true';

    if (forceWebSocket) {
        console.log('[Transport] Mode: WebSocket (forced by VITE_USE_WEBSOCKET)');
        const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
        return new WebSocketTransport(wsUrl, onMessage, onStatusChange);
    }

    // 2. Detect based on API base URL
    const apiBase = getConfig().apiBaseUrl || '';

    // Port 8001 = WebSocket (legacy desktop)
    if (apiBase.includes(':8001')) {
        console.log('[Transport] Mode: WebSocket (detected port 8001 - desktop)');
        const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
        return new WebSocketTransport(wsUrl, onMessage, onStatusChange);
    }

    // Port 8002 or default = REST
    console.log('[Transport] Mode: REST API (backend)', apiBase);
    return new RestTransport(apiBase);
}
