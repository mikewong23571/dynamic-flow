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
    return { ref, run };
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
              error: current.run.error,
              inputRevision: current.run.workItem?.revision,
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
      if (query)
        items = items.filter((i) =>
          `${i.key} ${i.title} ${i.goal} ${i.stage}`
            .toLocaleLowerCase()
            .includes(query),
        );
      if (options.status && options.status !== 'all')
        items = items.filter((i) => i.effectiveStatus === options.status);
      items.sort(
        (a, b) =>
          b.progressAt.localeCompare(a.progressAt) ||
          b.createdAt.localeCompare(a.createdAt),
      );
      return { items, total: items.length };
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
        record(item, 'run', '发起正式推进', { source: ref });
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
