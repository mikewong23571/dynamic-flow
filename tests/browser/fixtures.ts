import { test as base, expect } from '@playwright/test';
import { serve } from '@hono/node-server';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApplication } from '../../src/server/index';

export * from '@playwright/test';
type Application = Awaited<ReturnType<typeof createApplication>>;
/** Relative browser routes always use a fresh application and random private port. */
export const test = base.extend<
  {},
  { application: Application; applicationURL: string }
>({
  application: [
    async ({}, use) => {
      const dataRoot = await mkdtemp(join(tmpdir(), 'flowcraft-browser-'));
      const app = await createApplication({ dataRoot });
      try {
        await use(app);
      } finally {
        app.batches.close();
        app.runs.close();
        await rm(dataRoot, { recursive: true, force: true });
      }
    },
    { scope: 'worker' },
  ],
  applicationURL: [
    async ({ application }, use) => {
      const server = serve({
        fetch: application.app.fetch,
        hostname: '127.0.0.1',
        port: 0,
      });
      await new Promise<void>((resolve) =>
        server.listening ? resolve() : server.once('listening', resolve),
      );
      try {
        await use(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
      } finally {
        (server as Server).closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
    { scope: 'worker' },
  ],
  baseURL: async ({ applicationURL }, use) => use(applicationURL),
});
export { expect };
