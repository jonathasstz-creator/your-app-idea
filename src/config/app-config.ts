/**
 * Centralized Application Configuration
 * 
 * Resolution order (first non-empty wins):
 *   1. window.__APP_CONFIG__   — runtime injection (deploy-time, no rebuild)
 *   2. /config.json            — loaded async at boot (optional)
 *   3. import.meta.env.VITE_*  — build-time (Vite default, dev convenience)
 * 
 * This module is the SINGLE source of truth for all public frontend config.
 * Backend secrets (SERVICE_ROLE_KEY, JWT_SECRET, DB_URL) NEVER belong here.
 * 
 * To override at deploy time without rebuild:
 *   - Inject <script>window.__APP_CONFIG__ = { ... }</script> before app bundle
 *   - Or serve /config.json from your CDN/host
 */

// ─── Types ───────────────────────────────────────────────────────

export interface AppConfig {
  /** Supabase project URL (public) */
  supabaseUrl: string;
  /** Supabase anon/publishable key (public) */
  supabaseAnonKey: string;
  /** Backend API base URL, e.g. https://api.example.com */
  apiBaseUrl: string;
  /** Analytics API URL (optional, falls back to apiBaseUrl) */
  analyticsApiUrl: string;
  /** Analytics mode: 'api' | 'static' | 'off' */
  analyticsMode: string;
  /** Enable static fallback for analytics */
  enableStaticFallback: boolean;
}

// ─── Runtime injection interface ─────────────────────────────────

declare global {
  interface Window {
    __APP_CONFIG__?: Partial<Record<string, string>>;
  }
}

// ─── Resolution helpers ──────────────────────────────────────────

function getMetaEnv(): Record<string, string | undefined> {
  try {
    return (import.meta as any).env ?? {};
  } catch {
    return {};
  }
}

function resolve(
  key: string,
  runtimeKey: string,
  viteKeys: string[],
  fallback: string = ''
): string {
  // 1. Runtime injection
  const runtime = window.__APP_CONFIG__?.[runtimeKey];
  if (runtime) return runtime;

  // 2. Vite env (supports multiple key names for compatibility)
  const env = getMetaEnv();
  for (const vk of viteKeys) {
    const val = env[vk];
    if (val) return val;
  }

  // 3. Fallback
  return fallback;
}

// ─── Config singleton ────────────────────────────────────────────

let _config: AppConfig | null = null;
let _runtimeLoaded = false;

function buildConfig(): AppConfig {
  return {
    supabaseUrl: resolve('supabaseUrl', 'supabaseUrl', [
      'VITE_SUPABASE_URL',
    ]),
    supabaseAnonKey: resolve('supabaseAnonKey', 'supabaseAnonKey', [
      'VITE_SUPABASE_PUBLISHABLE_KEY',
      'VITE_SUPABASE_ANON_KEY',
    ]),
    apiBaseUrl: resolve('apiBaseUrl', 'apiBaseUrl', [
      'VITE_API_BASE_URL',
      'VITE_VIEWER_API_URL',
    ], 'http://127.0.0.1:8002'),
    analyticsApiUrl: resolve('analyticsApiUrl', 'analyticsApiUrl', [
      'VITE_VIEWER_API_URL',
    ]),
    analyticsMode: resolve('analyticsMode', 'analyticsMode', [
      'VITE_ANALYTICS_MODE',
    ], 'api'),
    enableStaticFallback: resolve('enableStaticFallback', 'enableStaticFallback', [
      'VITE_ENABLE_STATIC_FALLBACK',
    ], 'false') === 'true',
  };
}

/**
 * Get current config (sync, uses build-time + window.__APP_CONFIG__).
 * Safe to call at module init time.
 */
export function getConfig(): AppConfig {
  if (!_config) {
    _config = buildConfig();
  }
  return _config;
}

/**
 * Try to load /config.json at runtime. Call once during app bootstrap.
 * Merges runtime values over build-time values.
 * Fails silently — /config.json is optional.
 */
export async function loadRuntimeConfig(): Promise<AppConfig> {
  if (!_runtimeLoaded) {
    _runtimeLoaded = true;
    try {
      const resp = await fetch('/config.json', { cache: 'no-cache' });
      if (resp.ok) {
        const json = await resp.json();
        if (json && typeof json === 'object') {
          window.__APP_CONFIG__ = { ...json, ...window.__APP_CONFIG__ };
          _config = buildConfig(); // rebuild with new values
          if (isDev()) {
            console.log('[config] Runtime config loaded from /config.json');
          }
        }
      }
    } catch {
      // /config.json is optional — no error needed
    }
  }
  return getConfig();
}

// ─── Validation ──────────────────────────────────────────────────

export interface ConfigValidation {
  valid: boolean;
  missing: string[];
}

/**
 * Validate that required config values are present.
 * Does NOT throw — caller decides how to handle.
 */
export function validateConfig(config?: AppConfig): ConfigValidation {
  const c = config ?? getConfig();
  const missing: string[] = [];

  if (!c.supabaseUrl) missing.push('supabaseUrl (VITE_SUPABASE_URL)');
  if (!c.supabaseAnonKey) missing.push('supabaseAnonKey (VITE_SUPABASE_PUBLISHABLE_KEY)');

  return { valid: missing.length === 0, missing };
}

// ─── Helpers ─────────────────────────────────────────────────────

export function isDev(): boolean {
  try {
    return (import.meta as any).env?.DEV === true;
  } catch {
    return false;
  }
}

/**
 * Check if auth (Supabase) can be initialized.
 */
export function isAuthConfigured(): boolean {
  const c = getConfig();
  return Boolean(c.supabaseUrl && c.supabaseAnonKey);
}
