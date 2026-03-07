import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { getConfig, isAuthConfigured, isDev } from '../config/app-config';

let _client: SupabaseClient | null = null;

function initClient(): SupabaseClient | null {
  if (!isAuthConfigured()) {
    if (isDev()) {
      console.warn('[auth-client] Supabase não configurado.');
    }
    return null;
  }
  const cfg = getConfig();
  return createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export const supabase: SupabaseClient | null = (() => {
  _client = initClient();
  return _client;
})();

export const assertSupabaseClient = (): SupabaseClient => {
  if (!supabase) {
    throw new Error('Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
};

export type SupabaseSession = Session;
