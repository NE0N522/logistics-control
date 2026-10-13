import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const modulePath = id.replaceAll('\\', '/');
          if (/\/node_modules\/(recharts|d3-[^/]+|victory-vendor)\//.test(modulePath)) return 'charts';
          if (/\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(modulePath)) return 'react-vendor';
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true
      }
    }
  }
});
