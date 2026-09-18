import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxy = {
  '/api': {
    target: 'http://127.0.0.1:3100',
    changeOrigin: false,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
    allowedHosts: ['app.maxwwweeelll.org'],
  },
});
