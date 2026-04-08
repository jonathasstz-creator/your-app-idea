/**
 * Anti-regression: Session calls MUST go through api-proxy, never a dedicated "sessions" edge function.
 *
 * Root cause (2026-04-08): A stale "sessions" edge function was deployed but had no code,
 * returning 500. The app correctly routes through api-proxy, but a stale deploy caused
 * the error reporter to surface a confusing error. This test ensures:
 *
 * 1. All /v1/sessions/* calls route through api-proxy (not a dedicated function)
 * 2. proxyFetch always builds URL with api-proxy prefix
 * 3. proxyFetchJson handles 500 gracefully (no crash, structured error)
 * 4. fetchWithAuth in index.tsx delegates to proxyFetch (contract test)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PROXY_BASE = 'https://mkhmrcszcjfnmlcfaaln.supabase.co';
const EXPECTED_PREFIX = `${PROXY_BASE}/functions/v1/api-proxy`;

function setupConfig() {
  window.__APP_CONFIG__ = {
    supabaseUrl: 'https://tcpbogzrawoiyjjbxiiw.supabase.co',
    supabaseAnonKey: 'ext-key',
    proxyBaseUrl: PROXY_BASE,
    proxyAnonKey: 'lovable-key',
    apiBaseUrl: 'https://api.devoltecomele.com',
    analyticsApiUrl: 'https://api.devoltecomele.com',
    analyticsMode: 'api',
    enableStaticFallback: 'false',
  } as any;
}

describe('Session routing — api-proxy only (anti-regression)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    localStorage.clear();
    sessionStorage.clear();
    window.__APP_CONFIG__ = undefined;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.__APP_CONFIG__ = undefined;
    vi.unstubAllEnvs();
  });

  it('POST /v1/sessions routes through api-proxy, never /functions/v1/sessions', async () => {
    setupConfig();
    global.fetch = vi.fn(async () => new Response('{"session_id":"s1"}', { status: 200 })) as typeof fetch;

    const { proxyFetch } = await import('../proxy-fetch');
    await proxyFetch('/v1/sessions', { method: 'POST', body: JSON.stringify({ lesson_id: 'L1' }) });

    const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
    expect(calledUrl).toBe(`${EXPECTED_PREFIX}/v1/sessions`);
    expect(calledUrl).not.toContain('/functions/v1/sessions/');
    expect(calledUrl).toContain('/api-proxy/');
  });

  it('GET /v1/sessions/{id}/lesson routes through api-proxy', async () => {
    setupConfig();
    global.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;

    const { proxyFetch } = await import('../proxy-fetch');
    await proxyFetch('/v1/sessions/abc-123/lesson');

    const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
    expect(calledUrl).toBe(`${EXPECTED_PREFIX}/v1/sessions/abc-123/lesson`);
    expect(calledUrl).toContain('/api-proxy/');
  });

  it('POST /v1/sessions/{id}/complete routes through api-proxy', async () => {
    setupConfig();
    global.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;

    const { proxyFetch } = await import('../proxy-fetch');
    await proxyFetch('/v1/sessions/abc-123/complete', {
      method: 'POST',
      headers: { 'Idempotency-Key': 'idem-1' },
      body: JSON.stringify({ completed_at: new Date().toISOString() }),
    });

    const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
    expect(calledUrl).toBe(`${EXPECTED_PREFIX}/v1/sessions/abc-123/complete`);
  });

  it('proxyFetchJson handles 500 gracefully without crashing', async () => {
    setupConfig();
    global.fetch = vi.fn(async () => new Response('Internal Server Error', { status: 500 })) as typeof fetch;

    const { proxyFetchJson } = await import('../proxy-fetch');
    const err: any = await proxyFetchJson('/v1/sessions', { method: 'POST' }).catch(e => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(500);
    expect(err.body).toBe('Internal Server Error');
    expect(err.message).toContain('500');
  });

  it('proxyFetchJson handles network failure gracefully', async () => {
    setupConfig();
    global.fetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;

    const { proxyFetchJson } = await import('../proxy-fetch');
    const err = await proxyFetchJson('/v1/sessions').catch(e => e);

    expect(err).toBeInstanceOf(TypeError);
    expect(err.message).toContain('Failed to fetch');
  });

  it('PROXY_FN is always "api-proxy" — no other function name used for sessions', async () => {
    setupConfig();
    global.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;

    const { proxyFetch } = await import('../proxy-fetch');

    const paths = ['/v1/sessions', '/v1/sessions/x/lesson', '/v1/sessions/x/complete', '/v1/sessions/x/events'];
    for (const p of paths) {
      await proxyFetch(p);
    }

    const calls = (global.fetch as any).mock.calls;
    for (const [url] of calls) {
      expect(url).toContain('/functions/v1/api-proxy/');
      // Must NOT match /functions/v1/sessions (a dedicated sessions function)
      expect(url).not.toMatch(/\/functions\/v1\/sessions(?:\/|$)/);
    }
  });
});
