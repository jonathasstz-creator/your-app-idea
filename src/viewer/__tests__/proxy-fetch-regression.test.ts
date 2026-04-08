import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('proxyFetch anti-regressão — produção', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    localStorage.clear();
    sessionStorage.clear();
    window.__APP_CONFIG__ = undefined;
    global.fetch = vi.fn(async () => new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.__APP_CONFIG__ = undefined;
    vi.unstubAllEnvs();
  });

  it('usa o proxy integrado mesmo quando o auth runtime aponta para o projeto externo', async () => {
    window.__APP_CONFIG__ = {
      supabaseUrl: 'https://tcpbogzrawoiyjjbxiiw.supabase.co',
      supabaseAnonKey: 'external-publishable-key',
      proxyBaseUrl: 'https://mkhmrcszcjfnmlcfaaln.supabase.co',
      proxyAnonKey: 'lovable-cloud-key',
      apiBaseUrl: 'https://api.devoltecomele.com',
      analyticsApiUrl: 'https://api.devoltecomele.com',
      analyticsMode: 'api',
      enableStaticFallback: 'false',
    } as any;

    const { proxyFetch } = await import('../proxy-fetch');
    await proxyFetch('/v1/catalog');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://mkhmrcszcjfnmlcfaaln.supabase.co/functions/v1/api-proxy/v1/catalog',
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit',
        headers: expect.objectContaining({
          Accept: 'application/json',
          apikey: 'lovable-cloud-key',
        }),
      })
    );
  });

  it('usa proxyBaseUrl do runtime quando existir e faz fallback seguro do apikey de proxy', async () => {
    vi.stubEnv('VITE_SUPABASE_PROJECT_ID', 'mkhmrcszcjfnmlcfaaln');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'lovable-cloud-key');

    window.__APP_CONFIG__ = {
      supabaseUrl: 'https://tcpbogzrawoiyjjbxiiw.supabase.co',
      supabaseAnonKey: 'external-publishable-key',
      apiBaseUrl: 'https://api.devoltecomele.com',
      analyticsApiUrl: 'https://api.devoltecomele.com',
      analyticsMode: 'api',
      enableStaticFallback: 'false',
    } as any;

    const { proxyFetch } = await import('../proxy-fetch');
    await proxyFetch('/v1/sessions', { method: 'POST', body: JSON.stringify({ lesson_id: 'abc' }) });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://mkhmrcszcjfnmlcfaaln.supabase.co/functions/v1/api-proxy/v1/sessions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          apikey: expect.any(String),
        }),
      })
    );
  });
});