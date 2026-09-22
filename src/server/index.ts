import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { streamSSE } from 'hono/streaming';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFiles } from './files/index.ts';
import { createFlow } from './flow/index.ts';
import { createWorkService } from './work/index.ts';
import { createAssistant } from './assistant/index.ts';
import { createRuns } from './runs/index.ts';
import { createWorkItems } from './work-items/index.ts';
import { createTrials } from './trials/index.ts';
import {
  buildProfileDefinition,
  profileOutputs,
  withProfileFile,
} from './assistant/profile-flow.ts';
import {
  invalidPolicy,
  validateInvocation,
} from './flow/contracts.ts';
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
  } = {},
) {
  const dataRoot = options.dataRoot ?? resolve('data');
  const files = createFiles(dataRoot);
  await files.onServerStart();
  const flow = createFlow(files),
    work = createWorkService(files),
    assistant = createAssistant(files, flow, {
      settingsPath: resolve(dataRoot, 'model-settings.json'),
      // 未显式给数据目录时用仓库根 models.toml；测试数据目录下目录随之隔离。
      catalogPath: options.dataRoot
        ? resolve(dataRoot, 'models.toml')
        : resolve('models.toml'),
      ...(options.runSession ? { runSession: options.runSession } : {}),
    });
  const items = createWorkItems(dataRoot, files);
  /** 剖析运行 ID → 导入消息 requestId，用于收尾更新。 */
  const importRuns = new Map<string, string>();
  /** invoke 同步等待：runId → 终态通知；onFinish 到达时兑现。 */
  const invokeWaiters = new Map<string, (run: Run) => void>();
  /** 读取内建剖析的规范定义；内建工作不存在时先创建。 */
  async function canonicalProfileDefinition(): Promise<Definition> {
    const works = await files.list();
    let builtin = works.find((w) => w.title === BUILTIN_PROFILE_TITLE);
    if (!builtin) {
      builtin = await work.createWork(
        '内建数据剖析流程：上传文件触发，probe 判断规模，小文件直接拆分，大文件产出 schema 化洞见与清洗制品。',
        [],
      );
      await files.change(builtin.id, (w) => {
        w.title = BUILTIN_PROFILE_TITLE;
        w.titleEdited = true;
      });
      const id = await files.writeDefinition(
        builtin.id,
        buildProfileDefinition(),
      );
      await files.change(builtin.id, (w) => {
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
  app.onError((error, c) => {
    const issues = 'issues' in error ? error.issues : undefined;
    const code = 'code' in error ? error.code : undefined;
    return c.json(
      {
        error: error.message,
        ...(code ? { code } : {}),
        ...(issues ? { issues } : {}),
      },
      400,
    );
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
    const body = await c.req.json<{ goal: string; materials?: string[] }>();
    const w = await work.createWork(body.goal, body.materials ?? []);
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
    return c.json(await flow.snapshot(id));
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
  const hostname = process.env.HOST ?? '0.0.0.0';
  serve({ fetch: app.fetch, port, hostname }, () =>
    console.log(`Dynamic Flow API http://${hostname}:${port}`),
  );
}
