// Bootstrap: carrega runtime config antes de iniciar o viewer.
// Isso evita depender exclusivamente de VITE_* embutido no build.
import './viewer/styles.css';
import { loadRuntimeConfig, validateConfig, isDev } from './config/app-config';

async function bootstrap() {
  const config = await loadRuntimeConfig();
  const validation = validateConfig(config);

  if (!validation.valid) {
    console.error('[BOOT] Configuração pública incompleta:', validation.missing.join(', '));
    if (isDev()) {
      console.info('[BOOT] Origin:', window.location.origin);
      console.info('[BOOT] Missing:', validation.missing);
    }
  }

  await import('./viewer/index');
}

bootstrap().catch((error) => {
  console.error('[BOOT] Falha ao inicializar aplicação', error);
  alert('Falha ao inicializar configuração da aplicação.');
});
