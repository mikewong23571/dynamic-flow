import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { streamSSE } from 'hono/streaming';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFiles } from './files/index.ts';
import { createFlow } from './flow/index.ts';
import { createWorkService } from './work/index.ts';
import { createAssistant } from './assistant/index.ts';
import { createRuns } from './runs/index.ts';
import { createTrials } from './trials/index.ts';
import type {
  Definition,
  EditRequest,
  Inputs,
  Json,
  NodeExecution,
  Run,
  ViewState,
  ModelSettings,
} from '../shared/records.ts';
export async function createApplication(
  options: {
    dataRoot?: string;
    executeNode?: (context: NodeExecution) => Promise<Json>;
  } = {},
) {
  const dataRoot = options.dataRoot ?? resolve('data');
  const files = createFiles(dataRoot);
  await files.onServerStart();
  const flow = createFlow(files),
    work = createWorkService(files),
    assistant = createAssistant(files, flow, {
      settingsPath: resolve(dataRoot, 'model-settings.json'),
    });
  const runs = createRuns(files, options.executeNode ?? assistant.executeNode),
    trials = createTrials(files, runs);
  const app = new Hono();
  app.onError((error, c) => {
    const issues = 'issues' in error ? error.issues : undefined;
    return c.json({ error: error.message, ...(issues ? { issues } : {}) }, 400);
  });
  app.get('/api/config', (c) => c.json(assistant.configuration()));
  app.post('/api/config', async (c) =>
    c.json(
      await assistant.saveConfiguration(await c.req.json<ModelSettings>()),
    ),
  );
  app.get('/api/works', async (c) =>
    c.json(
      await work.listWorks({
        query: c.req.query('query'),
        page: c.req.query('page') ? Number(c.req.query('page')) : undefined,
        pageSize: c.req.query('pageSize')
          ? Number(c.req.query('pageSize'))
          : undefined,
        archived: c.req.query('archived') === 'true',
      }),
    ),
  );
  app.post('/api/works', async (c) => {
    const body = await c.req.json<{ goal: string; materials: string[] }>();
    const w = await work.createWork(body.goal, body.materials);
    return c.json(await flow.snapshot(w.id), 201);
  });
  app.get('/api/works/:id', async (c) =>
    c.json(await flow.snapshot(c.req.param('id'))),
  );
  app.post('/api/works/:id/preview-results', async (c) => {
    const { resultIds } = await c.req.json<{ resultIds: string[] }>();
    return c.json({
      inputs: await work.previewResults(c.req.param('id'), resultIds),
    });
  });
  app.post('/api/works/:id/actions', async (c) => {
    const id = c.req.param('id'),
      b = await c.req.json<Record<string, unknown>>();
    switch (b.action) {
      case 'rename':
        await work.rename(id, b.title as string);
        break;
      case 'archive':
        await work.archive(id, b.archived === true);
        break;
      case 'addMaterials':
        await work.addMaterials(id, b.materials as string[]);
        break;
      case 'saveDraft':
        await flow.saveDraft(
          id,
          b.expectedDraftId as string | undefined,
          b.definition as Definition,
        );
        break;
      case 'beginCandidate':
        await flow.beginCandidate(
          id,
          b.sourceId as string,
          b.replaceExisting === true,
        );
        break;
      case 'saveLayout':
        await flow.saveLayout(id, b.view as ViewState);
        break;
      case 'adopt':
        await flow.adopt(id, b.definitionId as string);
        break;
      case 'discardDraft':
        await flow.discardDraft(id);
        break;
      case 'keepResults':
        await work.keepResults(id, b.resultIds as string[]);
        break;
      case 'run':
        await runs.start(id, {
          definitionId: b.definitionId as string,
          scope: b.scope as Run['scope'],
          inputs: b.inputs as Inputs,
        });
        break;
      case 'retry':
        await runs.retry(
          id,
          b.runId as string,
          b.resultIds as string[],
          b.definitionId as string | undefined,
        );
        break;
      case 'stopRun':
        await runs.stop(id, b.runId as string);
        break;
      case 'compare':
        await trials.compare(id, {
          baselineId: b.baselineId as string | undefined,
          candidateId: b.candidateId as string,
          nodeId: b.nodeId as string,
          inputs: b.inputs as Inputs,
        });
        break;
      case 'stopComparison':
        await trials.stopComparison(id, b.comparisonId as string);
        break;
      case 'edit':
        await assistant.requestEdit(id, {
          text: b.text,
          expectedDraftId: b.expectedDraftId,
          nodeId: b.nodeId,
          sampleIds: b.sampleIds,
        } as EditRequest);
        break;
      case 'stopEdit':
        await assistant.stopEdit(id, b.requestId as string);
        break;
      default:
        throw Error('未知操作，请刷新后重试。');
    }
    return c.json(await flow.snapshot(id));
  });
  app.get('/api/works/:id/events', async (c) => {
    const id = c.req.param('id');
    await files.read(id);
    return streamSSE(c, async (stream) => {
      let closed = false,
        dirty = true,
        sending = false,
        lastRevision = -1;
      let finish!: () => void;
      const disconnected = new Promise<void>((r) => {
        finish = r;
      });
      async function flush() {
        if (closed || sending || !dirty) return;
        sending = true;
        dirty = false;
        try {
          const snapshot = await flow.snapshot(id);
          if (snapshot.work.revision > lastRevision && !closed) {
            lastRevision = snapshot.work.revision;
            await stream.writeSSE({
              event: 'snapshot',
              id: String(lastRevision),
              data: JSON.stringify(snapshot),
            });
          }
        } catch {
          closed = true;
          finish();
        } finally {
          sending = false;
        }
      }
      const unsubscribe = files.onChange((changedId) => {
        if (changedId === id) dirty = true;
      });
      const timer = setInterval(() => {
          void flush();
        }, 50),
        heartbeat = setInterval(() => {
          if (!closed)
            void stream.writeSSE({ event: 'ping', data: '{}' }).catch(() => {
              closed = true;
              finish();
            });
        }, 15000);
      stream.onAbort(() => {
        closed = true;
        finish();
      });
      try {
        await flush();
        await disconnected;
      } finally {
        closed = true;
        clearInterval(timer);
        clearInterval(heartbeat);
        unsubscribe();
      }
    });
  });
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', serveStatic({ path: './dist/index.html' }));
  return { app, files, flow, work, assistant, runs, trials };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { app } = await createApplication();
  const port = Number(process.env.PORT ?? 4321);
  serve({ fetch: app.fetch, port, hostname: '127.0.0.1' }, () =>
    console.log(`Dynamic Flow API http://127.0.0.1:${port}`),
  );
}
