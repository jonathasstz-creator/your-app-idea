import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'viewer',
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    host: '127.0.0.1',
    proxy: {
      // Proxy do WebSocket para o backend
      '/ws': {
        target: 'ws://127.0.0.1:8001',
        ws: true,
        changeOrigin: true
      },
      // Proxy dos arquivos XML/assets para o backend
      '/assets': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true
      },
      '/v1': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true
      }
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
});
