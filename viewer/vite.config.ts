import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    host: '127.0.0.1',
    proxy: {
      // Proxy do WebSocket para o backend (only used if VITE_USE_WEBSOCKET=true)
      '/ws': {
        target: 'ws://127.0.0.1:8001',  // Port 8001 for WebSocket mode (legacy desktop)
        ws: true,
        changeOrigin: true
      },
      // Proxy dos arquivos XML/assets para o backend
      '/assets': {
        target: 'http://127.0.0.1:8002',
        changeOrigin: true
      },
      '/v1': {
        target: 'http://127.0.0.1:8002',
        changeOrigin: true
      }
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
});
