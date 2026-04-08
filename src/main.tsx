// Bootstrap: carrega runtime config antes de iniciar o viewer.
// Isso evita depender exclusivamente de VITE_* embutido no build.
import './viewer/styles.css';
import { loadRuntimeConfig, validateConfig, isDev, isAuthConfigured } from './config/app-config';

// ── Boot State Machine ──────────────────────────────────────────
// Single owner of boot lifecycle. No other file should touch
// body.classList for app-booting/app-failed or data-app-state.
// viewer/index.tsx calls window.__appBoot__.ready() or .fail().

export type AppBootState = 'booting' | 'ready' | 'failed';

function setAppState(state: AppBootState) {
  document.body.dataset.appState = state;
  document.body.setAttribute('aria-busy', state === 'booting' ? 'true' : 'false');
  if (state === 'ready') {
    document.body.classList.remove('app-booting', 'app-failed');
  } else if (state === 'failed') {
    document.body.classList.remove('app-booting');
    document.body.classList.add('app-failed');
  }
}

function showBootError(error: unknown) {
  setAppState('failed');
  const msgEl = document.getElementById('boot-error-message');
  if (msgEl) {
    const err = error instanceof Error ? error : new Error(String(error));
    msgEl.textContent = `${err.message}\n\n${err.stack || ''}`;
  }
}

// Expose boot API globally — viewer/index.tsx is the sole consumer.
declare global {
  interface Window {
    __appBoot__: {
      ready: () => void;
      fail: (error: unknown) => void;
      getState: () => AppBootState;
    };
  }
}

let _currentState: AppBootState = 'booting';

window.__appBoot__ = {
  ready() {
    if (_currentState === 'failed') {
      console.warn('[BOOT] Cannot transition to ready from failed state.');
      return;
    }
    _currentState = 'ready';
    setAppState('ready');
  },
  fail(error: unknown) {
    _currentState = 'failed';
    showBootError(error);
  },
  getState() {
    return _currentState;
  },
};

async function bootstrap() {
  console.log('[BOOT] Iniciando bootstrap...');
  const config = await loadRuntimeConfig();
  console.log('[BOOT] Config carregada:', { supabaseUrl: !!config.supabaseUrl, anonKey: !!config.supabaseAnonKey, apiBase: config.apiBaseUrl });
  const validation = validateConfig(config);

  if (!validation.valid) {
    if (!isDev()) {
      // Production: config incompleta é fatal — não continuar para evitar
      // "supabaseUrl is required" downstream.
      throw new Error(
        `Configuração crítica ausente: ${validation.missing.join(', ')}. ` +
        `Verifique /config.json ou variáveis de ambiente.`
      );
    }
    console.warn('[BOOT] Configuração pública incompleta (DEV):', validation.missing.join(', '));
    console.info('[BOOT] Origin:', window.location.origin);
    console.info('[BOOT] Missing:', validation.missing);
  }

  console.log('[BOOT] Importando viewer...');
  await import('./viewer/index');
  console.log('[BOOT] Viewer carregado com sucesso.');
  // Note: setAppState('ready') is called by viewer/index.tsx via window.__appBoot__.ready()
}

bootstrap().catch((error) => {
  console.error('[BOOT] Falha ao inicializar aplicação', error);
  window.__appBoot__.fail(error);
});
