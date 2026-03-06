import React from 'react';
import { createRoot } from 'react-dom/client';
import { supabase } from './supabaseClient';
import AuthShell from './AuthShell';
import { syncSessionToLegacyStorage } from '../auth-storage';

/**
 * Ensures the user is authenticated. If not, shows a full-screen auth overlay.
 */
export async function ensureAuthenticated(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    syncSessionToLegacyStorage({ access_token: session.access_token, refresh_token: session.refresh_token });
    return;
  }

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'auth-gate';
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '9999',
      background: '#05060f',
    });
    document.body.appendChild(overlay);

    const app = document.getElementById('app');
    if (app) app.style.visibility = 'hidden';

    const root = createRoot(overlay);
    const handleAuthenticated = async () => {
      // Await session sync before resolving — ensures legacy token keys are
      // populated before init() runs and buildHeaders() reads them.
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          syncSessionToLegacyStorage({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
        }
      } catch { /* ignore */ }
      root.unmount();
      overlay.remove();
      if (app) app.style.visibility = '';
      window.dispatchEvent(new CustomEvent('auth:success'));
      resolve();
    };

    root.render(React.createElement(AuthShell, { onAuthenticated: handleAuthenticated }));
  });
}

export { supabase } from './supabaseClient';
export { authService } from './authService';
export type { AuthProfile } from './types';
