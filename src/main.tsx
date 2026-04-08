// Bootstrap: carrega runtime config antes de iniciar o viewer.
// Isso evita depender exclusivamente de VITE_* embutido no build.
import './viewer/styles.css';
import { loadRuntimeConfig, validateConfig, isDev } from './config/app-config';

function setAppState(state: 'booting' | 'ready' | 'failed') {
  document.body.dataset.appState = state;
  document.body.setAttribute('aria-busy', state === 'booting' ? 'true' : 'false');
  if (state === 'ready') {
    document.body.classList.remove('app-booting');
    document.body.classList.remove('app-failed');
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

async function bootstrap() {
  console.log('[BOOT] Iniciando bootstrap...');
  const config = await loadRuntimeConfig();
  console.log('[BOOT] Config carregada:', { supabaseUrl: !!config.supabaseUrl, anonKey: !!config.supabaseAnonKey, apiBase: config.apiBaseUrl });
  const validation = validateConfig(config);

  if (!validation.valid) {
    console.warn('[BOOT] Configuração pública incompleta:', validation.missing.join(', '));
    if (isDev()) {
      console.info('[BOOT] Origin:', window.location.origin);
      console.info('[BOOT] Missing:', validation.missing);
    }
  }

  console.log('[BOOT] Importando viewer...');
  await import('./viewer/index');
  console.log('[BOOT] Viewer carregado com sucesso.');
  // Note: setAppState('ready') is called by viewer/index.tsx after startApp completes
}

bootstrap().catch((error) => {
  console.error('[BOOT] Falha ao inicializar aplicação', error);
  showBootError(error);
});
