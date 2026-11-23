import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: process.env.HOST || '0.0.0.0',
    port: Number(process.env.FLOWCRAFT_WEB_PORT || 4330),
    strictPort: true,
    watch: {
      ignored: [
        '**/conductor/**',
        '**/test-results/**',
        '**/playwright-report/**',
        '**/data/**',
      ],
    },
    proxy: {
      '/api': `http://127.0.0.1:${process.env.FLOWCRAFT_API_PORT || 4331}`,
    },
  },
  build: { outDir: 'dist' },
  preview: { host: process.env.HOST || '0.0.0.0', port: 4332 },
});
