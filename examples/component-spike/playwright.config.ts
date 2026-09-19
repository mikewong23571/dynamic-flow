import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: '.',
  testMatch: 'browser.spec.ts',
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:4317',
    viewport: { width: 1440, height: 1000 },
    headless: true,
  },
  outputDir: '../../test-results',
  reporter: [
    ['list'],
    [
      'json',
      {
        outputFile: fileURLToPath(
          new URL('./evidence/browser-results.json', import.meta.url),
        ),
      },
    ],
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://127.0.0.1:4317',
    reuseExistingServer: true,
  },
});
