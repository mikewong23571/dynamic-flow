import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { runPiFixture } from './pi-session.ts';

const app = new Hono();
const active = new Map<string, AbortController>();
app.get('/api/health', (c) =>
  c.json({ ok: true, provider: 'pi-faux', active: active.size }),
);
app.post('/api/chat/:id/cancel', (c) => {
  const run = active.get(c.req.param('id'));
  run?.abort();
  return c.json({ cancelled: Boolean(run) });
});
app.post('/api/chat/:id', async (c) => {
  const id = c.req.param('id');
  const input = await c.req.json<{ text: string; sampleIds: string[] }>();
  const controller = new AbortController();
  active.set(id, controller);
  return streamSSE(c, async (stream) => {
    stream.onAbort(() => controller.abort());
    let writes = Promise.resolve();
    try {
      await runPiFixture({
        ...input,
        signal: controller.signal,
        emit: (event) => {
          writes = writes.then(() =>
            stream.writeSSE({ data: JSON.stringify(event) }),
          );
        },
      });
      await writes;
    } catch (error) {
      await stream.writeSSE({
        data: JSON.stringify({ type: 'error', message: String(error) }),
      });
    } finally {
      active.delete(id);
    }
  });
});
serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 4318 });
console.log('Pi fixture API: http://127.0.0.1:4318');
