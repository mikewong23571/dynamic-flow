import { mergeConfig, defineConfig } from 'vite';
import base from './vite.config';
export default mergeConfig(
  base,
  defineConfig({
    server: {
      host: '127.0.0.1',
      port: Number(process.env.FLOWCRAFT_WEB_PORT || 4330),
      strictPort: true,
      proxy: {
        '/api': `http://127.0.0.1:${process.env.FLOWCRAFT_API_PORT || 4331}`,
      },
    },
    build: { outDir: 'dist-composition' },
    preview: { host: '127.0.0.1', port: 4332 },
  }),
);
