import { defineConfig } from 'vite';
export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    watch: { usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' },
    proxy: { '/api': process.env.API_PROXY_TARGET || 'http://127.0.0.1:3000' },
  },
});
