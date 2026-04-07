/**
 * Centralized proxy fetch — routes ALL backend API calls through
 * the Supabase Edge Function `api-proxy` to avoid CORS issues.
 *
 * Usage:
 *   import { proxyFetch } from '@/viewer/proxy-fetch';
 *   const data = await proxyFetch('/v1/catalog');
 *   const session = await proxyFetch('/v1/sessions', { method: 'POST', body: JSON.stringify(payload) });
 */

import { getConfig } from '../config/app-config';
import { getAuthTokenFromStorage } from './auth-storage';

const PROXY_FN = 'api-proxy';

/**
 * Fetch any backend `/v1/*` path through the edge-function proxy.
 * Handles auth token forwarding via x-external-auth header.
 *
 * @param path  — e.g. "/v1/catalog", "/v1/sessions", "/v1/sessions/abc/complete"
 * @param init  — standard RequestInit (method, body, headers)
 * @returns Response-like object with status, ok, json(), text()
 */
export async function proxyFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const externalToken = getAuthTokenFromStorage();

  // Build custom headers
  const custom: Record<string, string> = {};
  if (externalToken) {
    custom['x-external-auth'] = `Bearer ${externalToken}`;
  }

  // Forward Idempotency-Key if provided in init.headers
  const initHeaders = init.headers instanceof Headers
    ? Object.fromEntries((init.headers as Headers).entries())
    : (init.headers as Record<string, string>) ?? {};

  if (initHeaders['Idempotency-Key'] || initHeaders['idempotency-key']) {
    custom['Idempotency-Key'] = initHeaders['Idempotency-Key'] || initHeaders['idempotency-key'];
  }

  // Supabase functions.invoke builds the URL as:
  //   {SUPABASE_URL}/functions/v1/{functionName}
  // We need to append the upstream path so the proxy can extract it.
  // Since supabase-js doesn't support path suffixes in invoke(), we call fetch directly.

  const cfg = getConfig();
  const supabaseUrl = cfg.supabaseUrl;

  const proxyUrl = `${supabaseUrl}/functions/v1/${PROXY_FN}${path}`;

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...custom,
  };

  // Add Supabase anon key for edge function auth
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (anonKey) {
    headers['apikey'] = anonKey;
  }

  // Forward content-type
  if (init.body) {
    headers['Content-Type'] = initHeaders['Content-Type'] || initHeaders['content-type'] || 'application/json';
  }

  return fetch(proxyUrl, {
    method: init.method ?? 'GET',
    headers,
    body: init.body ?? null,
    credentials: 'omit',
  });
}

/**
 * Convenience: proxyFetch + JSON parse + error handling
 */
export async function proxyFetchJson<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const resp = await proxyFetch(path, init);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err: any = new Error(`Proxy request failed (${resp.status}): ${text}`);
    err.status = resp.status;
    err.body = text;
    throw err;
  }
  return resp.json();
}
