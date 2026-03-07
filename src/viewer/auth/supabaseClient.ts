import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getConfig, isAuthConfigured, isDev } from '../../config/app-config';

let _client: SupabaseClient | null = null;

function initClient(): SupabaseClient | null {
  if (!isAuthConfigured()) {
    if (isDev()) {
      console.warn('[auth] Supabase não configurado. Auth desabilitado.');
    }
    return null;
  }
  const cfg = getConfig();
  return createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
}

/**
 * Supabase client singleton.
 * Returns null if config is missing (graceful degradation).
 */
export const supabase: SupabaseClient | null = (() => {
  _client = initClient();
  return _client;
})();
