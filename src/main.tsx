// Bootstrap: carrega runtime config antes de iniciar o viewer.
// Isso evita depender exclusivamente de VITE_* embutido no build.
import './viewer/styles.css';
import { loadRuntimeConfig, validateConfig, isDev } from './config/app-config';

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
}

bootstrap().catch((error) => {
  console.error('[BOOT] Falha ao inicializar aplicação', error);
  document.body.innerHTML = `<div style="color:white;background:#05060f;padding:2rem;font-family:monospace;min-height:100vh">
    <h2>Erro ao inicializar</h2>
    <pre style="white-space:pre-wrap;color:#ff6b6b">${error?.message || error}</pre>
    <pre style="white-space:pre-wrap;color:#666;font-size:0.8rem">${error?.stack || ''}</pre>
  </div>`;
});
