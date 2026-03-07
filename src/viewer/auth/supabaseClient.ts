import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL ?? '') as string;
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '') as string;

if (!url || !key) {
  console.warn('[auth] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não configurados. Auth desabilitado.');
}

export const supabase = url && key ? createClient(url, key) : null;
