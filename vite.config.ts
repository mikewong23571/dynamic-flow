import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: '127.0.0.1',
    port: 4320,
    strictPort: true,
    watch: {
      ignored: [
        '**/conductor/**',
        '**/test-results/**',
        '**/playwright-report/**',
        '**/data/**',
      ],
    },
    proxy: { '/api': 'http://127.0.0.1:4321' },
  },
  build: { outDir: 'dist' },
  preview: { host: '127.0.0.1', port: 4322 },
});
