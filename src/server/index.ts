import { createItemExecution } from './work-items/execution.ts';
import { contentPage } from './flow/overview.ts';
import { readRunSamples } from './work/run-samples.ts';
import { collectionFunction, nodeInputPorts } from '../shared/node-ports.ts';
import { namedValues } from './runs/collections.ts';
import { validateValue } from './flow/schema.ts';
import {
  prepareItemInputs,
  resolveItemInputs,
} from './work-items/run-inputs.ts';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { streamSSE } from 'hono/streaming';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFiles } from './files/index.ts';
import { createFlow } from './flow/index.ts';
import { createWorkService } from './work/index.ts';
import { createAssistant } from './assistant/index.ts';
import { createRuns } from './runs/index.ts';
import { createWorkItems } from './work-items/index.ts';
import { createBatchRuns } from './work-items/batch-runs.ts';
import { createWorkItemAssistant } from './assistant/workitem.ts';
import { createItemComposition } from './work-items/composition.ts';
import { createTrials } from './trials/index.ts';
import {
  buildProfileDefinition,
  profileOutputs,
  withProfileFile,
} from './assistant/profile-flow.ts';
import { invalidPolicy, validateInvocation } from './flow/contracts.ts';
import { validateForRun } from './flow/index.ts';
import type { SessionRunner } from './assistant/pi.ts';
import type {
  ChatMessage,
  Definition,
  EditRequest,
  Inputs,
  Json,
  NodeExecution,
  Run,
  ViewState,
  ModelSelection,
  CreateWorkItem,
  CompletionCriterion,
  CriterionReference,
  ItemInputSelection,
  RunSampleSource,
  WorkItemProgressReport,
  CreateChildrenRequest,
  CandidateSource,
  WorkItemRunSelection,
  WorkItemView,
} from '../shared/records.ts';
import type { CatalogInput } from './assistant/catalog.ts';

/** 内建数据剖析工作：规范定义的单一事实源，在工作库可见，被各工作导入使用。 */
const BUILTIN_PROFILE_TITLE = '内建·数据剖析';

export async function createApplication(
  options: {
    dataRoot?: string;
    executeNode?: (context: NodeExecution) => Promise<Json>;
    /** 测试注入：替换 Pi 会话执行器（interpret 修复环等真实模型路径的替身）。 */
    runSession?: SessionRunner;
    batchPollMs?: number;
  } = {},
) {
  const dataRoot =
    options.dataRoot ?? process.env.FLOWCRAFT_DATA_ROOT ?? resolve('data');
  const files = createFiles(dataRoot);
  await files.onServerStart();
  const items = createWorkItems(dataRoot, files);
  const flow = createFlow(files),
    work = createWorkService(files),
    assistant = createAssistant(files, flow, {
      reportProgress: items.reportProgress,
      readItemContext: items.context,
      settingsPath: resolve(dataRoot, 'model-settings.json'),
      // 未显式给数据目录时用仓库根 models.toml；测试数据目录下目录随之隔离。
      catalogPath: options.dataRoot
        ? resolve(dataRoot, 'models.toml')
        : resolve('models.toml'),
      ...(options.runSession ? { runSession: options.runSession } : {}),
    });
  /** 剖析运行 ID → 导入消息 requestId，用于收尾更新。 */
  const importRuns = new Map<string, string>();
  /** invoke 同步等待：runId → 终态通知；onFinish 到达时兑现。 */
  const invokeWaiters = new Map<string, (run: Run) => void>();
  /** 读取内建剖析的规范定义；内建工作不存在时先创建。 */
  async function canonicalProfileDefinition(): Promise<Definition> {
    const works = await files.list((w) => ({
      id: w.id,
      title: w.title,
      adoptedId: w.adoptedId,
    }));
    const builtin = works.find((w) => w.title === BUILTIN_PROFILE_TITLE);
    if (!builtin) {
      const created = await work.createWork(
        '内建数据剖析流程：上传文件触发，probe 判断规模，小文件直接拆分，大文件产出 schema 化洞见与清洗制品。',
        [],
      );
      await files.change(created.id, (w) => {
        w.title = BUILTIN_PROFILE_TITLE;
        w.titleEdited = true;
      });
      const id = await files.writeDefinition(
        created.id,
        buildProfileDefinition(),
      );
      await files.change(created.id, (w) => {
        w.definitionIds.push(id);
        w.adoptedId = id;
      });
      return buildProfileDefinition();
    }
    if (builtin.adoptedId)
      return files.readDefinition(builtin.id, builtin.adoptedId);
    return buildProfileDefinition();
  }
  /** 调用方工作持有按文件名实例化、与规范定义全等的剖析定义副本。 */
  async function seedProfileFlow(
    workId: string,
    file: string,
  ): Promise<string> {
    const want = withProfileFile(await canonicalProfileDefinition(), file);
    const current = await files.read(workId);
    for (const id of current.definitionIds) {
      const saved = await files.readDefinition(workId, id);
      if (isDeepStrictEqual(saved, want)) return id;
    }
    const id = await files.writeDefinition(workId, want);
    await files.change(workId, (w) => {
      if (!w.definitionIds.includes(id)) w.definitionIds.push(id);
    });
    return id;
  }
  async function finishImportRun(workId: string, run: Run) {
    const requestId = importRuns.get(run.id);
    if (!requestId) return;
    importRuns.delete(run.id);
    const patch = (edit: (message: ChatMessage) => void) =>
      files.change(workId, (current) => {
        const message = current.messages.find(
          (m) => m.role === 'assistant' && m.requestId === requestId,
        );
        if (message) edit(message);
      });
    if (run.status !== 'completed') {
      const detail =
        run.error ||
        run.results.find((result) => result.error)?.error ||
        `剖析运行${run.status === 'cancelled' ? '已停止' : '失败'}。`;
      await patch((message) => {
        message.status = 'failed';
        message.error = detail;
      });
      return;
    }
    try {
      const small = profileOutputs(run, 'register-small');
      const large = profileOutputs(run, 'profile');
      if (small.length) {
        const texts = small.flatMap((value) => {
          const list = (value as { materials?: unknown }).materials;
          return Array.isArray(list) ? (list as string[]) : [];
        });
        if (!texts.length) throw new Error('小文件拆分没有产出条目。');
        await work.addMaterials(workId, texts);
        await patch((message) => {
          message.status = 'completed';
          message.text = `已登记 ${texts.length} 条材料。`;
        });
      } else if (large.length) {
        // 洞见以 cleaned-insight.json 为准（节点脚本校验过），回复文本只做进度说明
        let insight: Json;
        try {
          insight = JSON.parse(
            (await files.readUpload(workId, 'cleaned-insight.json')).toString(
              'utf8',
            ),
          ) as Json;
        } catch {
          throw new Error(
            '剖析运行未产出 cleaned-insight.json，请重试本次导入。',
          );
        }
        for (const key of ['overview', 'structure', 'stats'])
          if ((insight as Record<string, unknown>)[key] === undefined)
            throw new Error(
              `cleaned-insight.json 缺少 ${key} 字段，请重试本次导入。`,
            );
        await work.addMaterials(workId, [JSON.stringify(insight)]);
        await patch((message) => {
          message.status = 'completed';
          message.text = '已登记剖析洞见；清洗制品已保存在工作文件中。';
        });
      } else {
        throw new Error('剖析运行没有产出可登记的内容。');
      }
    } catch (error) {
      await patch((message) => {
        message.status = 'failed';
        message.error = error instanceof Error ? error.message : String(error);
      });
    }
  }
  const runs = createRuns(files, options.executeNode ?? assistant.executeNode, {
      onMilestone: items.milestone,
      onCreateItems: async (parentId, source, signal) => {
        signal.throwIfAborted();
        const method = await files.read(source.workId),
          run = method.runs.find((r) => r.id === source.runId);
        if (
          !run ||
          run.workItem?.id !== parentId ||
          run.effectMode !== 'commit' ||
          run.scope !== 'full' ||
          run.comparisonId ||
          !['running', 'queued'].includes(run.status)
        )
          throw Error('当前运行不允许建立业务子项。');
        return (await items.createChildren(parentId, { source }, signal))
          .receipts;
      },
      onFinish: async (workId, run) => {
        await finishImportRun(workId, run);
        const waiter = invokeWaiters.get(run.id);
        invokeWaiters.delete(run.id);
        waiter?.(run);
      },
    }),
    trials = createTrials(files, runs);
  await items.reconcile();
  await runs.recover();
  const app = new Hono();
  const execution = createItemExecution(files, flow, items, runs);
  const composition = createItemComposition(
    files,
    flow,
    items,
    work,
    () => batches,
  );
  app.onError((error, c) => {
    const issues = 'issues' in error ? error.issues : undefined;
    const code = 'code' in error ? error.code : undefined;
    return c.json(
      {
        error: error.message,
        ...(code ? { code } : {}),
        ...(issues ? { issues } : {}),
        ...('affectedAncestors' in error
          ? { affectedAncestors: error.affectedAncestors }
          : {}),
      },
      400,
    );
  });
  const batches = createBatchRuns(
    dataRoot,
    items.get,
    (id, selection) => execution.runItem(id, selection),
    options.batchPollMs,
  );
  app.get('/api/item-batches', (c) =>
    c.json(batches.list(c.req.query('parentId'))),
  );
  app.get('/api/item-batches/:id', (c) =>
    c.json(batches.get(c.req.param('id'))),
  );
  app.post('/api/item-batches', async (c) =>
    c.json(await batches.create(await c.req.json()), 201),
  );
  app.post('/api/item-batches/:id/actions', async (c) => {
    const body = await c.req.json<{ action: 'pause' | 'resume' }>();
    return c.json(await batches.action(c.req.param('id'), body.action));
  });
  app.get('/api/config', (c) => c.json(assistant.configuration()));
  app.put('/api/config/catalog', async (c) =>
    c.json(await assistant.saveCatalog(await c.req.json<CatalogInput>())),
  );
  app.put('/api/config/default', async (c) => {
    const body = await c.req.json<{ selection?: ModelSelection | null }>();
    return c.json(await assistant.saveDefaultSelection(body.selection ?? null));
  });
  app.post('/api/config/test', async (c) => {
    const body = await c.req.json<{ alias?: string }>();
    if (!body.alias?.trim()) throw new Error('缺少要测试的模型别名。');
    return c.json(await assistant.testCatalogEntry(body.alias.trim()));
  });
  app.get('/api/items', async (c) =>
    c.json(
      await (c.req.query('summary') === 'true'
        ? items.summaries({
            parentId: c.req.query('parentId'),
            rootId: c.req.query('rootId'),
            view: c.req.query('view'),
            todo: c.req.query('todo'),
            ids: c.req.query('ids')?.split(',').filter(Boolean),
            page: Number(c.req.query('page') || 1),
            pageSize: Number(c.req.query('pageSize') || 25),
            query: c.req.query('query'),
            status: c.req.query('status'),
          })
        : items.list({
            query: c.req.query('query'),
            status: c.req.query('status'),
          })),
    ),
  );
  app.get('/api/items/:id', async (c) => {
    const id = c.req.param('id');
    const etag = `W/"${createHash('sha256')
      .update(await items.version(id))
      .digest('hex')}"`;
    c.header('ETag', etag);
    c.header('Cache-Control', 'no-store');
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304);
    return c.json(await items.get(id));
  });
  app.post('/api/items', async (c) =>
    c.json(await items.create(await c.req.json<CreateWorkItem>()), 201),
  );
  app.post('/api/items/:id/prepare', async (c) =>
    c.json(await items.prepare(c.req.param('id'), await c.req.json())),
  );
  app.get('/api/items/:id/content', async (c) => {
    const item = await items.get(c.req.param('id'));
    const q = c.req.query();
    const received = item.receivedInputs?.find(
      (input) => input.id === q.inputId,
    );
    const value = q.materialId
      ? (q.inputId ? received?.materials : item.materials)?.find(
          (m) => m.id === q.materialId,
        )?.text
      : received?.value;
    if (value === undefined) return c.json({ error: '指定内容不存在。' }, 404);
    if (q.download === 'true') {
      c.header('Content-Disposition', 'attachment; filename="content.json"');
      return c.newResponse(JSON.stringify(value), 200, {
        'Content-Type': 'application/json',
      });
    }
    return c.json(contentPage(value, Number(q.offset || 0)));
  });
  app.get(
    '/api/items/:id/deliveries/:deliveryId/records/:recordId',
    async (c) =>
      c.json(
        await composition.record(
          c.req.param('id'),
          c.req.param('deliveryId'),
          c.req.param('recordId'),
        ),
      ),
  );
  app.get('/api/items/:id/workspace', async (c) => {
    const id = c.req.param('id'),
      etag = `W/"${await composition.version(id)}"`;
    c.header('ETag', etag);
    c.header('Cache-Control', 'no-store');
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304);
    return c.json(await composition.snapshot(id));
  });
  app.get('/api/items/:id/inputs/:inputPort', async (c) =>
    c.json(
      await composition.readInputs(
        c.req.param('id'),
        c.req.param('inputPort'),
        Number(c.req.query('offset') || 0),
        Number(c.req.query('limit') || 25),
      ),
    ),
  );
  app.get('/api/items/:id/output', async (c) =>
    c.json(
      await composition.readOutput(c.req.param('id'), {
        output: c.req.query('output'),
        nodeId: c.req.query('nodeId'),
        port: c.req.query('port'),
        runId: c.req.query('runId'),
        offset: Number(c.req.query('offset') || 0),
        limit: Number(c.req.query('limit') || 25),
      }),
    ),
  );
  app.post('/api/items/:id/uploads', async (c) => {
    const name = c.req.query('name');
    if (!name) throw Error('缺少文件名。');
    return c.json(
      await composition.upload(
        c.req.param('id'),
        name,
        Buffer.from(await c.req.arrayBuffer()),
      ),
      201,
    );
  });
  async function dispatchComposition(
    id: string,
    b: Record<string, unknown>,
  ): Promise<unknown> {
    switch (b.action) {
      case 'init':
        return composition.init(id);
      case 'saveFlow':
        return composition.saveFlow(
          id,
          b.baseRevision as number,
          b.definition as Definition,
          b.expectedDraftId as string | undefined,
        );
      case 'checkFlow':
        return composition.check(id, b.definition as Definition);
      case 'checkWorkspace':
        return composition.checkWorkspace(id, {
          definition: b.definition,
          source: b.source as string | undefined,
          runId: b.runId as string | undefined,
        });
      case 'itemScope':
        return composition.itemScope(
          id,
          b.page as number | undefined,
          b.pageSize as number | undefined,
        );
      case 'childOutputs':
        return composition.childOutputs(
          id,
          b.offset as number | undefined,
          b.limit as number | undefined,
          b.scope as
            import('./work-items/source-scope.ts').StageSourceScope | undefined,
          b.nodeId as string | undefined,
        );
      case 'previewChildOutput':
        return composition.previewChildOutput(
          id,
          b.selection as Extract<
            import('../shared/records.ts').ItemInputSelection,
            { kind: 'child-results' }
          >,
        );
      case 'selectChildOutputs':
        return composition.selectChildOutputs(
          id,
          b.baseRevision as number,
          b.inputPort as string,
          b.selections as Extract<
            import('../shared/records.ts').ItemInputSelection,
            { kind: 'child-results' }
          >[],
        );
      case 'checkUiProgram':
        return composition.checkUiProgram(
          id,
          b.source as string,
          b.definitionId as string | undefined,
        );
      case 'saveUiProgram':
        return composition.saveUiProgram(id, b.baseRevision as number, {
          source: b.source as string | undefined,
          patch: b.patch as string | undefined,
          expectedProgramId: b.expectedProgramId as string | undefined,
          definitionId: b.definitionId as string | undefined,
        });
      case 'publishDelivery':
        return composition.publishDelivery(
          id,
          b.baseRevision as number,
          b.runId as string,
          b.output as string,
          b.programId as string,
        );
      case 'continueRecords':
        return composition.continueRecords(
          id,
          b.baseRevision as number,
          b.deliveryId as string,
          b.recordIds as string[],
          b.inputPort as string | undefined,
          b.methodId as string | undefined,
          b.methodDefinitionId as string | undefined,
          b.draft
            ? {
                draft: b.draft as Record<string, Json>,
                recordField: b.recordField as string | undefined,
              }
            : undefined,
        );
      case 'useMethod':
        return composition.useMethod(
          id,
          b.baseRevision as number,
          b.methodId as string,
          b.definitionId as string,
          b.scope as { nodeId: string } | undefined,
          b.inputBindings as Record<string, ItemInputSelection[]> | undefined,
        );
      case 'continueFailedInputs':
        await execution.continueFailedInputs(
          id,
          b as unknown as Parameters<typeof execution.continueFailedInputs>[1],
        );
        return composition.snapshot(id);
      case 'bindInputs':
        return composition.bindInputs(
          id,
          b.baseRevision as number,
          b.inputBindings as Record<string, ItemInputSelection[]>,
        );
      case 'selectInputs':
        return composition.selectInputs(
          id,
          b.baseRevision as number,
          b.inputPort as string,
          b.materialIds as string[],
        );
      case 'addInput':
      case 'reviseInput':
        return composition.addInput(
          id,
          b.baseRevision as number,
          b.inputPort as string,
          b.label as string,
          b.value as Json,
          b.inputId as string | undefined,
          b.materialIds as string[] | undefined,
        );
      case 'addEvidence':
        await items.addEvidence(
          id,
          b.materials as string[],
          b.baseRevision as number,
        );
        return composition.snapshot(id);
      case 'criteria':
        await items.criteria(
          id,
          b.criteria as CompletionCriterion[],
          b.baseRevision as number,
        );
        return composition.snapshot(id);
      case 'complete':
        await items.complete(id, b.baseRevision as number);
        return composition.snapshot(id);
      case 'reopen':
        await items.reopen(
          id,
          b.reason as string,
          b.confirmReopen === true,
          b.baseRevision as number,
        );
        return composition.snapshot(id);
      case 'saveMethod':
        return composition.saveMethod(
          id,
          b.baseRevision as number,
          b.title as string,
        );
      case 'assistant': {
        const receipt = await itemAssistant.request(id, b.text as string, {
          conversationId: b.conversationId as string | undefined,
          nodeId: b.nodeId as string | undefined,
          uiFocus: b.uiFocus as
            import('../shared/openui.ts').OpenUIFocus | undefined,
          expectedDraftId: b.expectedDraftId as string | undefined,
          methodReferences: b.methodReferences,
        });
        return { ...(await composition.snapshot(id)), ...receipt };
      }
      case 'createConversation':
        return itemAssistant.createConversation(id);
      case 'stopAssistant':
        await itemAssistant.stop(id, b.requestId as string);
        return composition.snapshot(id);
      case 'run':
        await execution.runItem(id, b as Partial<WorkItemRunSelection>);
        return composition.snapshot(id);
      case 'stop':
      case 'resume':
      case 'signal': {
        const item = await items.get(id);
        if (!item.execution) throw Error('没有可操作的执行。');
        if (b.runId !== undefined && b.runId !== item.execution.runId)
          throw Object.assign(Error('当前运行已变化，请重新检查。'), {
            code: 'RUN_CONFLICT',
          });
        if (b.baseRevision !== undefined && b.baseRevision !== item.revision)
          throw Object.assign(Error('工作项版本已变化，请重新检查。'), {
            code: 'REVISION_CONFLICT',
          });
        if (b.action === 'signal') {
          await items.signal(
            id,
            {
              id: b.eventId as string,
              name: b.name as string,
              payload: b.payload as Json | undefined,
            },
            runs.signal,
          );
          return composition.snapshot(id);
        }
        if (b.action === 'stop')
          await runs.stop(item.execution.workId, item.execution.runId);
        else await runs.resume(item.execution.workId, item.execution.runId);
        return composition.snapshot(id);
      }
      default:
        throw Error('未知工作项空间操作。');
    }
  }
  const itemAssistant = createWorkItemAssistant(
    files,
    composition,
    dispatchComposition,
    {
      settingsPath: resolve(dataRoot, 'model-settings.json'),
      catalogPath: options.dataRoot
        ? resolve(dataRoot, 'models.toml')
        : resolve('models.toml'),
      runSession: options.runSession,
    },
  );
  app.post('/api/items/:id/workspace/actions', async (c) =>
    c.json(
      await dispatchComposition(
        c.req.param('id'),
        await c.req.json<Record<string, unknown>>(),
      ),
    ),
  );
  app.post('/api/items/:id/actions', async (c) => {
    const id = c.req.param('id'),
      body = await c.req.json<Record<string, unknown>>();
    switch (body.action) {
      case 'createChildren':
        return c.json(
          await items.createChildren(
            id,
            body as unknown as CreateChildrenRequest,
          ),
        );
      case 'candidates':
        return c.json(
          body.page !== undefined
            ? await items.candidatePage(
                id,
                body.source as CandidateSource,
                Number(body.page),
                Number(body.pageSize ?? 25),
              )
            : await items.candidates(id, body.source as CandidateSource),
        );
      case 'reviseInput':
        return c.json(
          await items.reviseInput(id, {
            ...body,
            expectedRevision: body.baseRevision,
          } as unknown as Parameters<typeof items.reviseInput>[1]),
        );
      case 'scope':
        return c.json(
          await items.scope(
            id,
            body.status as 'included' | 'excluded',
            body.reason as string,
            body.confirmReopen === true,
          ),
        );
      case 'stagePreview':
        return c.json(
          await items.stagePreview(
            id,
            body.selection as Extract<
              ItemInputSelection,
              { kind: 'child-results' }
            >,
          ),
        );
      case 'stageInputs':
        return c.json(
          await items.stageInputs(
            id,
            body.scope as
              | import('./work-items/source-scope.ts').StageSourceScope
              | undefined,
          ),
        );
      case 'completionInputs':
        return c.json(await items.completionInputs(id));
      case 'reportProgress':
        return c.json(
          await items.reportProgress(
            id,
            body as unknown as WorkItemProgressReport,
          ),
        );
      case 'addEvidence':
        return c.json(
          await items.addEvidence(
            id,
            body.materials as string[],
            body.baseRevision as number | undefined,
          ),
        );
      case 'citeCriterion':
        return c.json(
          await items.citeCriterion(
            id,
            body.criterionId as string,
            body.criterionText as string,
            body.reference as CriterionReference,
          ),
        );
      case 'criteria':
        return c.json(
          await items.criteria(
            id,
            body.criteria as CompletionCriterion[],
            body.baseRevision as number | undefined,
          ),
        );
      case 'complete':
        return c.json(
          await items.complete(id, body.baseRevision as number | undefined),
        );
      case 'reopen':
        return c.json(
          await items.reopen(
            id,
            body.reason as string,
            body.confirmReopen === true,
            body.baseRevision as number | undefined,
          ),
        );
      case 'run':
        return c.json(
          await execution.runItem(id, body as Partial<WorkItemRunSelection>),
        );
      case 'useMethod':
        return c.json(
          (
            await composition.useMethod(
              id,
              body.baseRevision as number,
              body.methodId as string,
              body.definitionId as string,
              body.scope as { nodeId: string } | undefined,
              body.inputBindings as
                Record<string, ItemInputSelection[]> | undefined,
            )
          ).item,
        );
      case 'continueFailedInputs':
        return c.json(
          await execution.continueFailedInputs(
            id,
            body as unknown as Parameters<
              typeof execution.continueFailedInputs
            >[1],
          ),
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
    const body = await c.req.json<{ goal: string; materials?: string[] }>();
    const w = await work.createWork(body.goal, body.materials ?? []);
    return c.json(await flow.snapshot(w.id), 201);
  });
  app.get('/api/works/:id/content', async (c) => {
    const value = await files.select(c.req.param('id'), (w) => {
      const q = c.req.query();
      if (q.messageId) {
        const activity = w.messages
          .find((m) => m.id === q.messageId)
          ?.activities?.find((a) => a.id === q.activityId);
        if (activity)
          return {
            args: activity.args ?? null,
            result: activity.result ?? null,
          };
      } else {
        const run = w.runs.find((r) => r.id === q.runId);
        const result = run?.results.find((r) => r.id === q.resultId);
        if (q.materialId) {
          const material = (
            run?.workItem?.materials ||
            run?.materials ||
            w.materials
          ).find((m) => m.id === q.materialId);
          if (material) return material.text;
        }
        if (q.activityId) {
          const activity = result?.activities.find(
            (a) => a.id === q.activityId,
          );
          if (activity)
            return {
              args: activity.args ?? null,
              result: activity.result ?? null,
            };
        } else {
          const entries = q.resultId
            ? q.direction === 'input'
              ? result?.input
              : q.direction === 'outputs'
                ? result?.outputs
                : undefined
            : q.direction === 'inputs'
              ? run?.inputs
              : undefined;
          const entry = entries?.[q.port]?.[Number(q.index)];
          if (entry) return entry.value;
        }
      }
      throw Object.assign(Error('指定的固定内容不存在。'), {
        code: 'CONTENT_NOT_FOUND',
      });
    });
    if (c.req.query('download') === 'true') {
      c.header('Content-Disposition', 'attachment; filename="content.json"');
      return c.newResponse(JSON.stringify(value), 200, {
        'Content-Type': 'application/json',
      });
    }
    return c.json(contentPage(value, Number(c.req.query('offset') || 0)));
  });
  app.get('/api/works/:id', async (c) => {
    const id = c.req.param('id');
    try {
      if (c.req.query('view') === 'header')
        return c.json({
          work: await files.select(id, (w) => ({
            id: w.id,
            title: w.title,
            goal: w.goal,
            updatedAt: w.updatedAt,
            archivedAt: w.archivedAt,
          })),
        });
      const runIds = c.req.query('runIds')?.split(',');
      const snapshot = await flow.snapshot(id, {
        runIds,
        overview:
          c.req.query('view') !== 'full' &&
          (!!runIds || c.req.query('view') === 'overview'),
      });
      return c.json(snapshot);
    } catch (error) {
      const missing = error as NodeJS.ErrnoException;
      if (
        missing.code === 'ENOENT' &&
        missing.path === resolve(dataRoot, id, 'work.json')
      )
        return c.json(
          { code: 'WORK_NOT_FOUND', error: '这条流水线已不存在。' },
          404,
        );
      throw error;
    }
  });
  app.post('/api/works/:id/preview-results', async (c) => {
    const { resultIds } = await c.req.json<{ resultIds: string[] }>();
    return c.json({
      inputs: await work.previewResults(c.req.param('id'), resultIds),
    });
  });
  app.post('/api/works/:id/uploads', async (c) => {
    const name = c.req.query('name');
    if (!name) throw new Error('缺少文件名。');
    const data = Buffer.from(await c.req.arrayBuffer());
    if (!data.byteLength) throw new Error('文件内容为空。');
    if (data.byteLength > 50 * 1024 * 1024)
      throw new Error('文件超过 50MB；助手会分段读取，但过大文件请先拆分。');
    const file = await files.saveUpload(c.req.param('id'), name, data);
    return c.json({ file }, 201);
  });
  app.get('/api/works/:id/uploads', async (c) =>
    c.json({ files: await files.listUploads(c.req.param('id')) }),
  );
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
      case 'importMaterials': {
        const file = typeof b.file === 'string' ? b.file.trim() : '';
        if (!file) throw Error('缺少上传文件名。');
        try {
          await files.readUpload(id, file);
        } catch {
          throw Error('找不到该上传文件，请重新上传。');
        }
        const definitionId = await seedProfileFlow(id, file);
        const requestId = randomUUID();
        await files.change(id, (current) => {
          current.messages.push(
            {
              id: randomUUID(),
              role: 'user',
              text: `导入上传文件 ${file}`,
              requestId,
            },
            {
              id: randomUUID(),
              role: 'assistant',
              text: '正在剖析文件，可在运行结果中查看进度。',
              requestId,
              status: 'running',
              activities: [],
            },
          );
        });
        try {
          const runId = await runs.start(id, {
            definitionId,
            scope: 'full',
            inputs: {},
          });
          importRuns.set(runId, requestId);
        } catch (error) {
          await files.change(id, (current) => {
            const message = current.messages.find(
              (m) => m.role === 'assistant' && m.requestId === requestId,
            );
            if (message) {
              message.status = 'failed';
              message.error =
                error instanceof Error ? error.message : String(error);
            }
          });
          throw error;
        }
        break;
      }
      case 'saveDraft':
        await flow.saveDraft(
          id,
          b.expectedDraftId as string | undefined,
          b.definition as Definition,
        );
        break;
      case 'freezeExpansion':
        await flow.freezeExpansion(
          id,
          b.expectedDraftId as string | undefined,
          b.runId as string,
          b.nodeId as string,
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
      case 'run': {
        const scope = b.scope as Run['scope'];
        const prepared =
          b.sampleSource && typeof scope === 'object'
            ? readRunSamples(
                await files.read(id),
                b.sampleSource as RunSampleSource,
                scope.nodeId,
              )
            : { inputs: b.inputs as Inputs };
        await runs.start(id, {
          definitionId: b.definitionId as string,
          scope,
          ...prepared,
          effectMode: 'preview',
        });
        break;
      }
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
          sampleSource: b.sampleSource as RunSampleSource | undefined,
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
      case 'stopEdit': {
        const requestId = b.requestId as string;
        const importRun = [...importRuns.entries()].find(
          ([, req]) => req === requestId,
        );
        if (importRun) await runs.stop(id, importRun[0]);
        else await assistant.stopEdit(id, requestId);
        break;
      }
      default:
        throw Error('未知操作，请刷新后重试。');
    }
    return c.json(
      await flow.snapshot(id, { overview: c.req.query('view') === 'overview' }),
    );
  });
  /** 一次提取声明输出的最终值：排除规划与中间轮实例。 */
  const finalOutputs = (definition: Definition, run: Run) =>
    Object.fromEntries(
      Object.entries(definition.outputs).map(([name, [nodeId, port]]) => [
        name,
        run.results
          .filter(
            (r) =>
              r.nodeId === nodeId &&
              r.status === 'completed' &&
              !r.intermediate &&
              !r.purpose,
          )
          .flatMap((r) => (r.outputs[port] ?? []).map((i) => i.value)),
      ]),
    );
  /** 契约违约：带结构化 code，前端据此提供显式豁免入口，不靠文案前缀匹配。 */
  function contractViolation(message: string): Error {
    return Object.assign(new Error(message), { code: 'contract_violation' });
  }
  /** 一次性触发：裸值进、InputItem 服务端包装；契约违约默认门口拒绝，loose/interpret 显式留痕。 */
  app.post('/api/works/:id/invoke', async (c) => {
    const id = c.req.param('id');
    const b = await c.req.json<{
      inputs?: Record<string, unknown[]>;
      definition?: 'adopted' | 'draft' | string;
      mode?: 'loose';
      wait?: boolean;
      timeoutSeconds?: number;
    }>();
    const current = await files.read(id);
    const definitionId =
      !b.definition || b.definition === 'adopted'
        ? current.adoptedId
        : b.definition === 'draft'
          ? current.draftId
          : b.definition;
    if (!definitionId)
      throw new Error(
        '该工作还没有已采用的做法版本，请先采用或显式指定 definition。',
      );
    if (!current.definitionIds.includes(definitionId))
      throw new Error('指定的做法版本不存在。');
    const definition = await files.readDefinition(id, definitionId);
    validateForRun(definition);
    const rawInputs = b.inputs ?? {};
    for (const [port, values] of Object.entries(rawInputs)) {
      if (!definition.inputs.includes(port))
        throw new Error(`流程没有输入端口「${port}」。`);
      if (!Array.isArray(values))
        throw new Error(`端口「${port}」的输入必须是一组条目（数组）。`);
    }
    // 严格入口：声明了契约且未显式 loose 时逐条校验。
    const contracts = definition.inputContracts ?? {};
    const repairedPorts: string[] = [];
    if (Object.keys(contracts).length && b.mode !== 'loose') {
      const issues = validateInvocation(definition, rawInputs);
      if (issues.length) {
        const interpretPorts = new Set(
          Object.entries(contracts)
            .filter(([, contract]) => invalidPolicy(contract) === 'interpret')
            .map(([port]) => port),
        );
        const hard = issues.filter((issue) => !interpretPorts.has(issue.port));
        if (hard.length)
          throw contractViolation(
            `输入不符合契约：${hard.map((issue) => issue.message).join('；')}`,
          );
        // interpret 修复环：违约细节喂回 agent 修复，复检仍失败如实拒绝。
        for (const port of interpretPorts) {
          const contract = contracts[port]!;
          const repaired = await assistant
            .repairInvocation(id, {
              port,
              schema: contract.item ?? {},
              errors: issues
                .filter((issue) => issue.port === port)
                .map((issue) => issue.message),
              values: rawInputs[port] ?? [],
            })
            .catch((error) => {
              throw contractViolation(
                `输入不符合契约且修复失败：${error instanceof Error ? error.message : String(error)}`,
              );
            });
          const still = validateInvocation(definition, {
            ...rawInputs,
            [port]: repaired,
          }).filter((issue) => issue.port === port);
          if (still.length)
            throw contractViolation(
              `输入不符合契约且修复失败：${still.map((issue) => issue.message).join('；')}`,
            );
          rawInputs[port] = repaired;
          repairedPorts.push(port);
        }
      }
    }
    const inputs: Inputs = Object.fromEntries(
      Object.entries(rawInputs).map(([port, values]) => [
        port,
        values.map((value, index) => ({
          sampleId: `${port}-${index + 1}`,
          value: value as Json,
          materialIds: [],
          sourceResultIds: [],
        })),
      ]),
    );
    const runId = await runs.start(id, {
      definitionId,
      scope: 'full',
      inputs,
    });
    if (b.mode === 'loose' || repairedPorts.length)
      await files.change(id, (work) => {
        const run = work.runs.find((r) => r.id === runId);
        if (run)
          run.invocation = {
            ...(b.mode === 'loose' ? { loose: true } : {}),
            ...(repairedPorts.length ? { repairedPorts } : {}),
          };
      });
    if (!b.wait) return c.json({ runId, status: 'started' });
    const timeoutMs =
      Math.min(Math.max(b.timeoutSeconds ?? 120, 1), 600) * 1000;
    const finished = await new Promise<Run | undefined>((resolveWait) => {
      const timer = setTimeout(() => {
        invokeWaiters.delete(runId);
        resolveWait(undefined);
      }, timeoutMs);
      invokeWaiters.set(runId, (run) => {
        clearTimeout(timer);
        resolveWait(run);
      });
      // 极快运行可能在注册等待前已终态。
      void files.read(id).then((work) => {
        const run = work.runs.find((r) => r.id === runId);
        if (
          run &&
          ['completed', 'failed', 'cancelled'].includes(run.status) &&
          invokeWaiters.delete(runId)
        ) {
          clearTimeout(timer);
          resolveWait(run);
        }
      });
    });
    if (!finished) return c.json({ runId, status: 'running' }, 202);
    return c.json({
      runId,
      status: finished.status,
      ...(finished.error ? { error: finished.error } : {}),
      outputs: finalOutputs(definition, finished),
    });
  });
  app.post('/api/works/:id/model-selection', async (c) => {
    const id = c.req.param('id'),
      body = await c.req.json<{ selection?: ModelSelection | null }>();
    await assistant.saveWorkSelection(id, body.selection ?? null);
    return c.json(
      await flow.snapshot(id, { overview: c.req.query('view') === 'overview' }),
    );
  });
  app.get('/api/works/:id/events', async (c) => {
    const id = c.req.param('id');
    await files.select(id, (w) => w.id);
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
          const snapshot = await flow.snapshot(id, {
            overview: c.req.query('view') === 'overview',
          });
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
  await batches.recover();
  return {
    app,
    files,
    flow,
    work,
    assistant,
    runs,
    trials,
    items,
    batches,
    composition,
    execution,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { app } = await createApplication();
  const port = Number(
    process.env.FLOWCRAFT_API_PORT ?? process.env.PORT ?? 4331,
  );
  const hostname = process.env.HOST ?? '0.0.0.0';
  serve({ fetch: app.fetch, port, hostname }, () =>
    console.log(`Dynamic Flow API http://${hostname}:${port}`),
  );
}
