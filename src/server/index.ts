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
import { createWorkItems } from './work-items/index.ts';
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
  CreateWorkItem,
  CompletionCriterion,
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
  const items = createWorkItems(dataRoot, files);
  const runs = createRuns(files, options.executeNode ?? assistant.executeNode, {
      onMilestone: items.milestone,
    }),
    trials = createTrials(files, runs);
  await items.reconcile();
  await runs.recover();
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
  app.get('/api/items', async (c) =>
    c.json(
      await items.list({
        query: c.req.query('query'),
        status: c.req.query('status'),
      }),
    ),
  );
  app.get('/api/items/:id', async (c) =>
    c.json(await items.get(c.req.param('id'))),
  );
  app.post('/api/items', async (c) =>
    c.json(await items.create(await c.req.json<CreateWorkItem>()), 201),
  );
  app.post('/api/items/:id/actions', async (c) => {
    const id = c.req.param('id'),
      body = await c.req.json<Record<string, unknown>>();
    switch (body.action) {
      case 'addEvidence':
        return c.json(await items.addEvidence(id, body.materials as string[]));
      case 'criteria':
        return c.json(
          await items.criteria(id, body.criteria as CompletionCriterion[]),
        );
      case 'complete':
        return c.json(await items.complete(id));
      case 'reopen':
        return c.json(await items.reopen(id, body.reason as string));
      case 'method':
        return c.json(await items.method(id, body.workflowId as string));
      case 'run':
        return c.json(
          await items.launch(id, async (input, workId) => {
            const method = await files.read(workId);
            const definitionId =
              (body.definitionId as string | undefined) ??
              method.adoptedId ??
              method.draftId;
            if (!definitionId || !method.definitionIds.includes(definitionId))
              throw Error('请选择该处理方法中已保存的版本。');
            const definition = await files.readDefinition(workId, definitionId);
            if (definition.inputs.length !== 1)
              throw Error(
                '工作项运行需要一个明确的材料输入端口，请在流程中合并输入入口。',
              );
            const inputs: Inputs = {
              [definition.inputs[0]]: input.materials.map((m) => ({
                sampleId: m.id,
                value: m.text,
                materialIds: [m.id],
                sourceResultIds: [],
              })),
            };
            const runId = await runs.start(workId, {
              definitionId,
              scope: 'full',
              inputs,
              workItem: input,
              effectMode: 'commit',
            });
            return { workId, runId, definitionId };
          }),
        );
      case 'signal':
        return c.json(
          await items.signal(
            id,
            {
              id: body.id as string,
              name: body.name as string,
              payload: body.payload as Json | undefined,
            },
            runs.signal,
          ),
        );
      case 'resume':
      case 'stop': {
        const item = await items.get(id),
          current = item.execution;
        if (!current) throw Error('工作项尚未发起运行。');
        if (body.action === 'resume')
          await runs.resume(current.workId, current.runId);
        if (body.action === 'stop')
          await runs.stop(current.workId, current.runId);
        return c.json(await items.get(id));
      }
      default:
        throw Error('未知工作项操作。');
    }
  });
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
  return { app, files, flow, work, assistant, runs, trials, items };
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
