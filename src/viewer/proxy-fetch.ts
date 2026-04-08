/**
 * Centralized proxy fetch — routes ALL backend API calls through
 * the Supabase Edge Function `api-proxy` to avoid CORS issues.
 *
 * Usage:
 *   import { proxyFetch } from '@/viewer/proxy-fetch';
 *   const data = await proxyFetch('/v1/catalog');
 *   const session = await proxyFetch('/v1/sessions', { method: 'POST', body: JSON.stringify(payload) });
 */

import { getConfig, getProxyAnonKey, getProxyBaseUrl } from '../config/app-config';
import { getAuthTokenFromStorage } from './auth-storage';

const PROXY_FN = 'api-proxy';

export async function proxyFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const externalToken = getAuthTokenFromStorage();

  const custom: Record<string, string> = {};
  if (externalToken) {
    custom['x-external-auth'] = `Bearer ${externalToken}`;
  }

  const initHeaders = init.headers instanceof Headers
    ? Object.fromEntries(init.headers.entries())
    : (init.headers as Record<string, string>) ?? {};

  if (initHeaders['Idempotency-Key'] || initHeaders['idempotency-key']) {
    custom['Idempotency-Key'] = initHeaders['Idempotency-Key'] || initHeaders['idempotency-key'];
  }

  const cfg = getConfig();
  const proxyBaseUrl = getProxyBaseUrl(cfg);
  const proxyAnonKey = getProxyAnonKey(cfg);
  const proxyUrl = `${proxyBaseUrl}/functions/v1/${PROXY_FN}${path}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    apikey: proxyAnonKey,
    ...custom,
  };

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
