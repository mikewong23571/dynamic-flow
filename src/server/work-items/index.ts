import { materializeDefinition } from '../../shared/expansion.ts';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import type { FileStore } from '../files/index.ts';
import type {
  CompletionCriterion,
  CreateWorkItem,
  FlowNode,
  Inputs,
  ItemHistory,
  ItemRunRef,
  Run,
  RunSignal,
  WorkItem,
  WorkItemInput,
  WorkItemPage,
  WorkItemProgressReport,
  WorkItemSummary,
  WorkItemView,
} from '../../shared/records.ts';

const timestamp = () => new Date().toISOString();
const unsettled = new Set([
  'queued',
  'running',
  'waiting',
  'stopping',
  'interrupted',
]);
function required(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw Error(`请填写${label}。`);
  return value.trim();
}
function texts(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string'))
    throw Error(`${label}需要文本列表。`);
  return value.map((v) => v.trim()).filter(Boolean);
}

export function createWorkItems(dataRoot: string, files: FileStore) {
  const root = join(dataRoot, 'work-items');
  const pending = new Map<string, Promise<unknown>>();
  function serial<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const next = (pending.get(key) ?? Promise.resolve())
      .catch(() => {})
      .then(operation);
    pending.set(key, next);
    void next
      .finally(() => {
        if (pending.get(key) === next) pending.delete(key);
      })
      .catch(() => {});
    return next;
  }
  async function read(id: string): Promise<WorkItem> {
    return JSON.parse(
      await readFile(join(root, `${id}.json`), 'utf8'),
    ) as WorkItem;
  }
  async function save(item: WorkItem) {
    await mkdir(root, { recursive: true });
    const destination = join(root, `${item.id}.json`),
      temp = `${destination}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(item, null, 2), { flag: 'wx' });
      await rename(temp, destination);
    } finally {
      await rm(temp, { force: true });
    }
  }
  async function all(): Promise<WorkItem[]> {
    await mkdir(root, { recursive: true });
    const names = await readdir(root);
    return Promise.all(
      names.filter((n) => n.endsWith('.json')).map((n) => read(n.slice(0, -5))),
    );
  }
  function record(
    item: WorkItem,
    kind: ItemHistory['kind'],
    summary: string,
    extra: Partial<ItemHistory> = {},
  ) {
    const at = timestamp();
    item.history.push({ id: randomUUID(), at, kind, summary, ...extra });
    if (kind !== 'run') item.progressAt = at;
  }
  async function execution(item: WorkItem) {
    const ref = item.runs.at(-1);
    if (!ref) return undefined;
    const work = await files.read(ref.workId);
    const run = work.runs.find((r) => r.id === ref.runId);
    if (!run) throw Error('工作项关联的运行不存在，请检查保存记录。');
    return { ref, run, work };
  }
  async function activeNodes(
    current: NonNullable<Awaited<ReturnType<typeof execution>>>,
  ) {
    const { run, ref, work } = current;
    if (!['queued', 'running', 'waiting', 'stopping'].includes(run.status))
      return [];
    // Legacy records may reference an unavailable definition; no invented node labels.
    if (!work.definitionIds.includes(ref.definitionId)) return [];
    const fixed = await files.readDefinition(ref.workId, ref.definitionId);
    const definition = materializeDefinition(fixed, run.expansions ?? []);
    return definition.nodes
      .filter((node) =>
        ['running', 'waiting', 'stopping'].includes(run.nodeStates[node.id]),
      )
      .map((node) => {
        const parent = run.expansions?.find((e) =>
          node.id.startsWith(`${e.nodeId}/`),
        );
        const parentLabel = parent
          ? fixed.nodes.find((n) => n.id === parent.nodeId)?.label
          : undefined;
        return {
          id: node.id,
          label: node.label,
          ...(node.contract?.responsibility
            ? { responsibility: node.contract.responsibility }
            : {}),
          ...(parentLabel ? { parentLabel } : {}),
        };
      });
  }
  async function view(item: WorkItem): Promise<WorkItemView> {
    const current = await execution(item);
    const status = current?.run.status;
    const effectiveStatus: WorkItemView['effectiveStatus'] =
      item.status === 'completed'
        ? 'completed'
        : status === 'waiting'
          ? 'waiting'
          : status && ['queued', 'running', 'stopping'].includes(status)
            ? 'running'
            : status && ['failed', 'interrupted', 'cancelled'].includes(status)
              ? 'attention'
              : item.blocker?.trim()
                ? 'attention'
                : 'open';
    return {
      ...item,
      effectiveStatus,
      ...(current
        ? {
            execution: {
              ...current.ref,
              status: current.run.status,
              waits: (current.run.waits ?? []).filter(
                (w) => w.status === 'pending',
              ),
              error:
                current.run.error ||
                [
                  ...new Set(
                    current.run.results
                      .filter((r) => r.status === 'failed')
                      .map((r) => r.error)
                      .filter(Boolean),
                  ),
                ].join('；') ||
                undefined,
              inputRevision: current.run.workItem?.revision,
              activeNodes: await activeNodes(current),
            },
          }
        : {}),
    };
  }
  async function assertIdle(item: WorkItem) {
    const current = await execution(item);
    if (current && unsettled.has(current.run.status))
      throw Error('工作项有未结束运行，请先继续或停止该运行。');
  }
  function assertOpen(item: WorkItem) {
    if (item.status === 'completed')
      throw Error('工作项已结项，请先重新打开。');
  }
  async function change(
    id: string,
    edit: (item: WorkItem) => void | Promise<void>,
  ): Promise<WorkItemView> {
    return serial(id, async () => {
      const item = await read(id);
      await edit(item);
      item.revision++;
      item.updatedAt = timestamp();
      await save(item);
      return view(item);
    });
  }
  const service = {
    async reconcile() {
      for (const work of await files.list())
        for (const run of work.runs) {
          if (!run.workItem || run.effectMode !== 'commit') continue;
          const item = await read(run.workItem.id);
          if (item.runs.some((r) => r.runId === run.id)) continue;
          await change(item.id, (saved) => {
            if (saved.runs.some((r) => r.runId === run.id)) return;
            const source = {
              workId: work.id,
              runId: run.id,
              definitionId: run.definitionId,
            };
            saved.runs.push(source);
            delete saved.nextAction;
            delete saved.blocker;
            record(saved, 'run', '恢复已保存的正式运行关联', { source });
          });
        }
    },
    async signal(
      id: string,
      event: Pick<RunSignal, 'id' | 'name' | 'payload'>,
      deliver: (
        workId: string,
        runId: string,
        event: Pick<RunSignal, 'id' | 'name' | 'payload'>,
      ) => Promise<void>,
    ) {
      return serial(id, async () => {
        required(event.id, '事件 ID');
        required(event.name, '事件名称');
        const item = await read(id);
        for (const ref of item.runs) {
          const work = await files.read(ref.workId);
          const previous = work.runs
            .find((r) => r.id === ref.runId)
            ?.signals?.find((s) => s.id === event.id);
          if (!previous) continue;
          if (
            previous.name !== event.name ||
            !isDeepStrictEqual(previous.payload, event.payload)
          )
            throw Error('事件 ID 已用于不同内容，请使用新的事件 ID。');
          return view(item);
        }
        const current = await execution(item);
        if (!current) throw Error('工作项尚未发起运行。');
        await deliver(current.ref.workId, current.ref.runId, event);
        return view(item);
      });
    },
    async get(id: string) {
      return view(await read(id));
    },
    async list(
      options: { query?: string; status?: string } = {},
    ): Promise<WorkItemPage> {
      const query = options.query?.trim().toLocaleLowerCase();
      let items = await Promise.all((await all()).map(view));
      const summary: WorkItemSummary = {
        total: items.length,
        pending: 0,
        open: 0,
        running: 0,
        waiting: 0,
        attention: 0,
        completed: 0,
      };
      for (const item of items) {
        summary[item.effectiveStatus]++;
        if (item.status !== 'completed') summary.pending++;
      }
      if (query)
        items = items.filter((i) =>
          `${i.key} ${i.title} ${i.goal} ${i.stage}`
            .toLocaleLowerCase()
            .includes(query),
        );
      if (options.status && options.status !== 'all')
        items = items.filter((i) =>
          options.status === 'pending'
            ? i.status !== 'completed'
            : i.effectiveStatus === options.status,
        );
      items.sort(
        (a, b) =>
          b.progressAt.localeCompare(a.progressAt) ||
          b.createdAt.localeCompare(a.createdAt),
      );
      return { items, total: items.length, summary };
    },
    async create(input: CreateWorkItem): Promise<WorkItemView> {
      return serial('$create', async () => {
        const key = required(input.key, '业务编号'),
          title = required(input.title, '标题'),
          goal = required(input.goal, '目标');
        const workflowId = required(input.workflowId, '处理方法');
        await files.read(workflowId);
        const criteria = texts(input.criteria, '完成条件');
        if (!criteria.length) throw Error('请填写至少一条完成条件。');
        const materialText = texts(input.materials, '材料');
        if ((await all()).some((i) => i.key === key))
          throw Error('该业务编号已存在，请打开原工作项继续。');
        if (
          input.data !== undefined &&
          (!input.data ||
            typeof input.data !== 'object' ||
            Array.isArray(input.data))
        )
          throw Error('业务数据需要对象。');
        const at = timestamp();
        const item: WorkItem = {
          id: randomUUID(),
          key,
          title,
          goal,
          workflowId,
          data: input.data ?? {},
          revision: 0,
          materials: materialText.map((text, index) => ({
            id: `M${String(index + 1).padStart(2, '0')}`,
            text,
          })),
          criteria: criteria.map((text) => ({
            id: randomUUID(),
            text,
            met: false,
            evidence: '',
          })),
          status: 'open',
          stage: '待处理',
          summary: '',
          runs: [],
          history: [],
          createdAt: at,
          updatedAt: at,
          progressAt: at,
        };
        record(item, 'created', `登记工作项：${title}`);
        await save(item);
        return view(item);
      });
    },
    addEvidence(id: string, materials: string[]) {
      const additions = texts(materials, '材料');
      if (!additions.length) throw Error('请填写新增证据。');
      return change(id, (item) => {
        assertOpen(item);
        const start = item.materials.length;
        const added = additions.map((text, index) => ({
          id: `M${String(start + index + 1).padStart(2, '0')}`,
          text,
        }));
        item.materials.push(...added);
        record(item, 'evidence', `补充 ${added.length} 条证据`, {
          materialIds: added.map((m) => m.id),
        });
      });
    },
    criteria(id: string, criteria: CompletionCriterion[]) {
      return change(id, (item) => {
        assertOpen(item);
        if (
          !Array.isArray(criteria) ||
          criteria.length !== item.criteria.length ||
          new Set(criteria.map((c) => c.id)).size !== item.criteria.length
        )
          throw Error('完成条件不匹配，请重新读取工作项。');
        for (const criterion of criteria) {
          const saved = item.criteria.find((c) => c.id === criterion.id);
          if (
            !saved ||
            saved.text !== criterion.text ||
            typeof criterion.met !== 'boolean' ||
            typeof criterion.evidence !== 'string'
          )
            throw Error('完成条件不匹配，请重新读取工作项。');
          if (criterion.met && !criterion.evidence.trim())
            throw Error(`请为“${saved.text}”填写满足条件的依据。`);
        }
        item.criteria = criteria.map((c) => ({
          ...c,
          evidence: c.evidence.trim(),
        }));
        record(
          item,
          'criteria',
          `确认完成条件 ${criteria.filter((c) => c.met).length} / ${criteria.length}`,
          { criteria: structuredClone(item.criteria) },
        );
      });
    },
    complete(id: string) {
      return change(id, async (item) => {
        assertOpen(item);
        await assertIdle(item);
        if (
          !item.criteria.length ||
          item.criteria.some((c) => !c.met || !c.evidence.trim())
        )
          throw Error('仍有未满足或缺少依据的完成条件。');
        item.status = 'completed';
        delete item.nextAction;
        delete item.blocker;
        item.stage = '已结项';
        item.summary = '所有完成条件已确认并记录依据。';
        record(item, 'completed', item.summary, {
          criteria: structuredClone(item.criteria),
        });
      });
    },
    reopen(id: string, reason: string) {
      const text = required(reason, '重新打开的原因');
      return change(id, (item) => {
        if (item.status !== 'completed') throw Error('工作项尚未结项。');
        item.status = 'open';
        delete item.nextAction;
        delete item.blocker;
        item.stage = '待重新评估';
        item.summary = text;
        item.criteria = item.criteria.map((c) => ({ ...c, met: false }));
        record(item, 'reopened', text);
      });
    },
    method(id: string, workflowId: string) {
      return change(id, async (item) => {
        assertOpen(item);
        await assertIdle(item);
        const method = await files.read(required(workflowId, '处理方法'));
        if (item.workflowId === workflowId) return;
        item.workflowId = workflowId;
        delete item.nextAction;
        delete item.blocker;
        record(item, 'method', `切换处理方法：${method.title || method.goal}`);
      });
    },
    launch(
      id: string,
      start: (input: WorkItemInput, workflowId: string) => Promise<ItemRunRef>,
    ) {
      return change(id, async (item) => {
        assertOpen(item);
        await assertIdle(item);
        if (!item.materials.length) throw Error('请先补充本工作项的输入材料。');
        const input: WorkItemInput = {
          id: item.id,
          key: item.key,
          title: item.title,
          goal: item.goal,
          revision: item.revision,
          data: structuredClone(item.data),
          materials: structuredClone(item.materials),
        };
        const ref = await start(input, item.workflowId);
        item.runs.push(ref);
        delete item.nextAction;
        delete item.blocker;
        record(item, 'run', '发起正式推进', { source: ref });
      });
    },
    reportProgress(
      id: string,
      report: WorkItemProgressReport,
      signal?: AbortSignal,
    ) {
      return serial(id, async () => {
        signal?.throwIfAborted();
        const item = await read(id);
        const reportId = required(report.id, '报告 ID');
        const stage = required(report.stage, '阶段');
        const summary = required(report.summary, '进展摘要');
        const optionalText = (value: unknown, label: string) =>
          value === undefined ? undefined : required(value, label);
        const nextAction = optionalText(report.nextAction, '下一步');
        const blocker = optionalText(report.blocker, '业务阻碍');
        const materialIds = [
          ...new Set(texts(report.materialIds ?? [], '材料引用')),
        ].sort();
        let source: WorkItemProgressReport['source'];
        if (report.source !== undefined) {
          if (!report.source || typeof report.source !== 'object')
            throw Error('报告来源不完整。');
          source = {
            workId: required(report.source.workId, '来源方法'),
            runId: required(report.source.runId, '来源运行'),
            definitionId: required(report.source.definitionId, '来源版本'),
            nodeId: required(report.source.nodeId, '来源步骤'),
            instanceId: required(report.source.instanceId, '来源实例'),
          };
        }
        const origin = source ? ('agent' as const) : ('external' as const);
        const progress = {
          stage,
          ...(nextAction ? { nextAction } : {}),
          ...(blocker ? { blocker } : {}),
        };
        const previous = item.history.find(
          (h) => h.id === `progress:${reportId}`,
        );
        if (previous) {
          if (
            previous.kind !== 'progress' ||
            previous.summary !== summary ||
            previous.origin !== origin ||
            !isDeepStrictEqual(previous.progress, progress) ||
            !isDeepStrictEqual(previous.source, source) ||
            !isDeepStrictEqual(previous.materialIds ?? [], materialIds)
          )
            throw Error('报告 ID 已用于不同内容，请使用新的报告 ID。');
          return view(item);
        }
        assertOpen(item);
        let allowedMaterials = item.materials;
        if (source) {
          const current = await execution(item);
          if (
            !current ||
            current.ref.workId !== source.workId ||
            current.ref.runId !== source.runId ||
            current.ref.definitionId !== source.definitionId ||
            current.run.workItem?.id !== item.id
          )
            throw Error('报告来源不属于本工作项当前正式运行。');
          const run = current.run;
          if (
            run.stopRequested ||
            !['queued', 'running', 'waiting'].includes(run.status)
          )
            throw Error('运行已停止或结束，不能报告进展。');
          if (
            run.scope !== 'full' ||
            run.effectMode !== 'commit' ||
            run.comparisonId
          )
            throw Error('只有正式工作项全量执行可以报告进展。');
          const instance = run.results.find(
            (r) =>
              r.nodeId === source!.nodeId &&
              r.instanceId === source!.instanceId &&
              r.definitionId === source!.definitionId &&
              r.runId === source!.runId &&
              r.status === 'running' &&
              r.purpose !== 'planning',
          );
          const fixed = await files.readDefinition(
            source.workId,
            source.definitionId,
          );
          const node = materializeDefinition(
            fixed,
            run.expansions ?? [],
          ).nodes.find((n) => n.id === source!.nodeId);
          if (!instance || node?.kind !== 'agent')
            throw Error('报告来源不是当前活动的普通 Agent 实例。');
          allowedMaterials = run.workItem!.materials;
        } else {
          await assertIdle(item);
          if (
            !Number.isInteger(report.expectedRevision) ||
            report.expectedRevision !== item.revision
          )
            throw Error('工作项版本已变化，请重新读取后报告。');
        }
        if (
          materialIds.some((mid) => !allowedMaterials.some((m) => m.id === mid))
        )
          throw Error('报告材料不属于本工作项的本次输入。');
        // Definition reads may yield while stop/finish updates the Run; reject that late write too.
        if (source) {
          const latest = (await files.read(source.workId)).runs.find(
            (r) => r.id === source!.runId,
          );
          if (
            !latest ||
            latest.stopRequested ||
            !['queued', 'running', 'waiting'].includes(latest.status) ||
            !latest.results.some(
              (r) =>
                r.nodeId === source!.nodeId &&
                r.instanceId === source!.instanceId &&
                r.status === 'running' &&
                r.purpose !== 'planning',
            )
          )
            throw Error('运行已停止或结束，不能报告进展。');
        }
        item.stage = stage;
        item.summary = summary;
        if (nextAction) item.nextAction = nextAction;
        else delete item.nextAction;
        if (blocker) item.blocker = blocker;
        else delete item.blocker;
        record(item, 'progress', summary, {
          id: `progress:${reportId}`,
          origin,
          progress,
          ...(source ? { source } : {}),
          materialIds,
        });
        item.revision++;
        item.updatedAt = timestamp();
        signal?.throwIfAborted();
        await save(item);
        return view(item);
      });
    },
    async milestone(workId: string, run: Run, node: FlowNode, inputs: Inputs) {
      if (!run.workItem || run.effectMode !== 'commit' || run.scope !== 'full')
        return;
      const effectId = `${run.id}:${node.id}`;
      await change(run.workItem.id, (item) => {
        if (item.history.some((h) => h.id === effectId)) return;
        assertOpen(item);
        if (!node.milestone) throw Error('业务里程碑缺少阶段与摘要。');
        delete item.nextAction;
        delete item.blocker;
        item.stage = node.milestone.stage;
        item.summary = node.milestone.summary;
        const values = Object.values(inputs).flat();
        record(item, 'milestone', item.summary, {
          id: effectId,
          source: {
            workId,
            runId: run.id,
            definitionId: run.definitionId,
            nodeId: node.id,
            resultIds: [...new Set(values.flatMap((v) => v.sourceResultIds))],
          },
          materialIds: [...new Set(values.flatMap((v) => v.materialIds))],
        });
      });
    },
  };
  return service;
}
