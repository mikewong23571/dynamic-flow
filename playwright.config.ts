import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/browser',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4320',
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: [
    {
      command: 'pnpm dev:api',
      url: 'http://127.0.0.1:4321/api/config',
      reuseExistingServer: true,
    },
    {
      command: 'pnpm dev:web',
      url: 'http://127.0.0.1:4320',
      reuseExistingServer: true,
    },
  ],
});
