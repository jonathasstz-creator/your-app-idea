import React from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './supabaseClient';
import AuthShell from './AuthShell';
import { syncSessionToLegacyStorage } from '../auth-storage';
import { isAuthConfigured, getConfig, isDev } from '../../config/app-config';

export type AuthBootstrapResult =
  | { status: 'authenticated' }
  | { status: 'unauthenticated' }
  | { status: 'disabled' };

/**
 * Ensures the user is authenticated.
 * 
 * - If auth config is missing → returns 'disabled' (app works offline).
 * - If session exists → returns 'authenticated'.
 * - If no session → renders login overlay and BLOCKS until user logs in,
 *   then returns 'authenticated'. No internal UI is shown before auth.
 */
export async function ensureAuthenticated(): Promise<AuthBootstrapResult> {
  // ── Config validation ──────────────────────────────────────────
  if (!isAuthConfigured()) {
    const cfg = getConfig();
    const details = [
      `supabaseUrl: ${cfg.supabaseUrl ? '✅' : '❌ missing'}`,
      `supabaseAnonKey: ${cfg.supabaseAnonKey ? '✅' : '❌ missing'}`,
      `domain: ${window.location.origin}`,
    ].join(', ');
    console.warn(`[AUTH] Config incompleta (${details}). Continuando sem autenticação.`);
    return { status: 'disabled' };
  }

  if (!supabase) {
    console.warn('[AUTH] Supabase client não inicializado. Continuando sem autenticação.');
    return { status: 'disabled' };
  }

  // ── Check existing session ─────────────────────────────────────
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    syncSessionToLegacyStorage({ access_token: session.access_token, refresh_token: session.refresh_token });
    return { status: 'authenticated' };
  }

  // ── No session: show auth overlay and BLOCK until user logs in ──
  return new Promise<AuthBootstrapResult>((resolve) => {
    // Hide boot splash so auth gate is visible (prevents z-index deadlock)
    const bootSplash = document.getElementById('boot-splash');
    if (bootSplash) bootSplash.style.display = 'none';

    const overlay = document.createElement('div');
    overlay.id = 'auth-gate';
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '100000',
      background: '#05060f',
    });
    document.body.appendChild(overlay);

    const root = createRoot(overlay);
    const handleAuthenticated = async () => {
      try {
        const { data } = await supabase!.auth.getSession();
        if (data.session) {
          syncSessionToLegacyStorage({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
        }
      } catch { /* ignore */ }
      root.unmount();
      overlay.remove();
      window.dispatchEvent(new CustomEvent('auth:success'));
      // NOW resolve — app init only starts after successful login
      resolve({ status: 'authenticated' });
    };

    root.render(React.createElement(AuthShell, { onAuthenticated: handleAuthenticated }));

    // DO NOT resolve here — block until user authenticates
  });
}

export { supabase } from './supabaseClient';
export { authService } from './authService';
export type { AuthProfile } from './types';
