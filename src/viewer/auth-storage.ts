const LEGACY_KEYS = [
  "access_token",
  "supabase.auth.token",
  "SUPABASE_SESSION",
  "SUPABASE_ACCESS_TOKEN",
];

const getSupabaseProjectRef = (): string | null => {
  const url = (import.meta as any)?.env?.VITE_SUPABASE_URL as string | undefined;
  if (!url) return null;
  const match = url.match(/^https?:\/\/([^.]+)\.supabase\.co/i);
  return match?.[1] ?? null;
};

const getSupabaseStorageKey = (): string | null => {
  const ref = getSupabaseProjectRef();
  return ref ? `sb-${ref}-auth-token` : null;
};

const extractAccessToken = (raw: string): string | null => {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.access_token) return parsed.access_token;
    if (parsed?.session?.access_token) return parsed.session.access_token;
    if (parsed?.currentSession?.access_token) return parsed.currentSession.access_token;
    if (parsed?.data?.session?.access_token) return parsed.data.session.access_token;
  } catch {
    // ignore parse errors, fallback handled below
  }
  return raw || null;
};

export const getAuthTokenFromStorage = (): string | null => {
  const dynamicKey = getSupabaseStorageKey();
  const candidates = dynamicKey ? [dynamicKey, ...LEGACY_KEYS] : [...LEGACY_KEYS];

  for (const key of candidates) {
    const raw = sessionStorage.getItem(key) ?? localStorage.getItem(key);
    if (!raw) continue;
    const token = extractAccessToken(raw);
    if (token) return token;
  }
  return null;
};

export const syncSessionToLegacyStorage = (session: { access_token: string; refresh_token?: string }) => {
  if (!session?.access_token) return;
  const payload = JSON.stringify(session);
  localStorage.setItem("supabase.auth.token", payload);
  localStorage.setItem("SUPABASE_SESSION", payload);
  localStorage.setItem("SUPABASE_ACCESS_TOKEN", session.access_token);
};

export const clearAuthStorage = () => {
  const dynamicKey = getSupabaseStorageKey();
  const keys = dynamicKey ? [dynamicKey, ...LEGACY_KEYS] : LEGACY_KEYS;
  keys.forEach((k) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
};

export const AUTH_OVERLAY_ROOT_ID = "auth-overlay-root";
