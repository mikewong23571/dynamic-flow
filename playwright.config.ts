import { defineConfig } from '@playwright/test';
/** Each browser fixture owns its temporary data and random-port application. */
export default defineConfig({
  testDir: 'tests/browser',
  testMatch: '**/*.spec.ts',
  timeout: 90000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  use: {
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  reporter: [['list']],
  outputDir: 'test-results/browser',
});
