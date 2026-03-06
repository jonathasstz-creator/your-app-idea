import { assertSupabaseClient } from './auth-client';
import { AUTH_OVERLAY_ROOT_ID, getAuthTokenFromStorage, syncSessionToLegacyStorage, clearAuthStorage } from './auth-storage';

const OVERLAY_HTML = `
  <div class="auth-overlay">
    <div class="auth-card">
      <div class="auth-header">
        <p class="auth-kicker">Acesso obrigatório</p>
        <h1>Entrar</h1>
        <p class="auth-sub">Use seu email e senha do Supabase Auth para continuar.</p>
      </div>
      <form class="auth-form">
        <label class="auth-label">
          <span>Email</span>
          <input name="email" type="email" autocomplete="email" required />
        </label>
        <label class="auth-label">
          <span>Senha</span>
          <input name="password" type="password" autocomplete="current-password" required />
        </label>
        <button type="submit" class="auth-btn" data-role="submit">Entrar</button>
        <p class="auth-error" hidden></p>
      </form>
      <p class="auth-meta">Tokens são armazenados localmente apenas para esta origem.</p>
    </div>
  </div>
`;

const ensureOverlay = (): HTMLElement => {
  let root = document.getElementById(AUTH_OVERLAY_ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = AUTH_OVERLAY_ROOT_ID;
    document.body.appendChild(root);
  }
  root.innerHTML = OVERLAY_HTML;
  return root;
};

const hideOverlay = () => {
  const root = document.getElementById(AUTH_OVERLAY_ROOT_ID);
  if (root) root.remove();
};

const wireForm = (onSuccess: (token: string) => void) => {
  const root = ensureOverlay();
  const form = root.querySelector<HTMLFormElement>('form.auth-form');
  const submitBtn = root.querySelector<HTMLButtonElement>('button[data-role="submit"]');
  const errorEl = root.querySelector<HTMLElement>('.auth-error');

  if (!form || !submitBtn || !errorEl) return;

  const setLoading = (loading: boolean) => {
    submitBtn.disabled = loading;
    submitBtn.textContent = loading ? 'Entrando...' : 'Entrar';
  };

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const formData = new FormData(form);
    const email = String(formData.get('email') || '').trim();
    const password = String(formData.get('password') || '');
    errorEl.hidden = true;
    errorEl.textContent = '';

    if (!email || !password) {
      errorEl.textContent = 'Informe email e senha.';
      errorEl.hidden = false;
      return;
    }

    const client = assertSupabaseClient();
    setLoading(true);
    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data.session?.access_token) throw new Error('Sessão não recebida.');
      syncSessionToLegacyStorage(data.session);
      onSuccess(data.session.access_token);
      hideOverlay();
    } catch (err: any) {
      const message = err?.message || 'Falha ao entrar';
      errorEl.textContent = message;
      errorEl.hidden = false;
      clearAuthStorage();
    } finally {
      setLoading(false);
    }
  });
};

export const ensureAuthToken = async (): Promise<string> => {
  const existing = getAuthTokenFromStorage();
  if (existing) return existing;

  const client = assertSupabaseClient();

  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (data.session?.access_token) {
    syncSessionToLegacyStorage(data.session);
    return data.session.access_token;
  }

  return new Promise<string>((resolve, reject) => {
    try {
      wireForm((token) => resolve(token));
    } catch (err) {
      reject(err);
    }
  });
};

export const watchAuthChanges = () => {
  const client = assertSupabaseClient();
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      clearAuthStorage();
      window.location.reload();
      return;
    }
    if (session?.access_token) {
      syncSessionToLegacyStorage(session);
    }
  });
};
