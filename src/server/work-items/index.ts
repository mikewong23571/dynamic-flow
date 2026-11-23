import { createWorkService } from '../work/index.ts';
import { resolveItemInputs } from './run-inputs.ts';
import { childStageInputs } from './stage-inputs.ts';
import { structuredProgress } from '../../shared/progress-summary';
import {
  effectiveItemStatus,
  hasUnretriedFailures,
  type RetryRunSummary,
} from '../../shared/workitem-status';
import {
  createChildrenService,
  included,
  readCandidateSource,
} from './children.ts';
import { createItemQueries } from './queries.ts';
import { createItemPreparation } from './prepare.ts';
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
  stat,
} from 'node:fs/promises';
import { join } from 'node:path';
import type { FileStore } from '../files/index.ts';
import type {
  CompletionCriterion,
  CriterionReference,
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
  let savedVersion = 0;
  let allIndex: Map<string, WorkItem> | undefined;
  let allDirSig = '';
  let allLoading: Promise<Map<string, WorkItem>> | undefined;
  async function dirSignature() {
    await mkdir(root, { recursive: true });
    const info = await stat(root);
    return `${info.mtimeMs}:${info.ctimeMs}`;
  }
  async function version() {
    return `${savedVersion}:${await dirSignature()}`;
  }
  const itemQueues = new Map<string, Promise<unknown>>();
  let treeBarrier: Promise<unknown> = Promise.resolve();
  const reads = new Map<
    string,
    { version: string; value: Promise<WorkItem> }
  >();
  async function fileSignature(path: string) {
    const info = await stat(path);
    return `${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
  }
  async function load(id: string) {
    const path = join(root, `${id}.json`),
      version = await fileSignature(path);
    let entry = reads.get(id);
    if (!entry || entry.version !== version) {
      entry = {
        version,
        value: readFile(path, 'utf8').then(
          (text) => JSON.parse(text) as WorkItem,
        ),
      };
      reads.set(id, entry);
      const current = entry;
      void entry.value.catch(() => {
        if (reads.get(id) === current) reads.delete(id);
      });
    }
    return { version, item: await entry.value };
  }
  /**
   * Single-item writes serialize per itemId and run concurrently across distinct items.
   * Cross-item tree operations (keys starting with '$') acquire an exclusive barrier.
   */
  function serial<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (key.startsWith('$')) {
      const prevTree = treeBarrier;
      // Snapshot only already-queued item operations before publishing the new barrier (strictly acyclic).
      const inFlight = [...itemQueues.values()];
      const next = Promise.allSettled([prevTree, ...inFlight]).then(operation);
      treeBarrier = next.catch(() => {});
      return next;
    }
    const prevTree = treeBarrier;
    const prevItem = itemQueues.get(key) ?? Promise.resolve();
    const next = Promise.allSettled([prevTree, prevItem]).then(operation);
    itemQueues.set(key, next);
    void next
      .finally(() => {
        if (itemQueues.get(key) === next) itemQueues.delete(key);
      })
      .catch(() => {});
    return next;
  }
  async function read(id: string): Promise<WorkItem> {
    return structuredClone((await load(id)).item);
  }
  async function save(item: WorkItem) {
    await mkdir(root, { recursive: true });
    const destination = join(root, `${item.id}.json`),
      temp = `${destination}.${randomUUID()}.tmp`;
    const snapshot = structuredClone(item);
    try {
      await writeFile(temp, JSON.stringify(snapshot, null, 2), { flag: 'wx' });
      await rename(temp, destination);
      const sig = await fileSignature(destination);
      reads.set(item.id, { version: sig, value: Promise.resolve(snapshot) });
      savedVersion++;
      if (allIndex) {
        allIndex.set(item.id, snapshot);
        allDirSig = await dirSignature();
      }
    } finally {
      await rm(temp, { force: true });
    }
  }
  async function all(): Promise<WorkItem[]> {
    const currentDirSig = await dirSignature();
    if (!allIndex || allDirSig !== currentDirSig) {
      if (!allLoading) {
        allLoading = (async () => {
          const names = await readdir(root);
          const ids = names
            .filter((name) => name.endsWith('.json'))
            .map((name) => name.slice(0, -5));
          const loaded = await Promise.all(
            ids.map(async (id) => [id, (await load(id)).item] as const),
          );
          const next = new Map<string, WorkItem>(loaded);
          allIndex = next;
          allDirSig = await dirSignature();
          return next;
        })();
        void allLoading.finally(() => {
          allLoading = undefined;
        });
      }
      const map = await allLoading;
      return structuredClone([...map.values()]);
    }
    return structuredClone([...allIndex.values()]);
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
  function summarizeRun(run: Run): RetryRunSummary {
    const failedResultIds = run.results
      .filter((r) => r.status === 'failed')
      .map((r) => r.id);
    return {
      id: run.id,
      status: run.status,
      retrySource: run.retrySource,
      ...(failedResultIds.length ? { failedResultIds } : {}),
    };
  }
  async function itemUnretriedFailures(
    item: WorkItem,
    current: Awaited<ReturnType<typeof execution>>,
  ) {
    if (
      !current ||
      current.run.status !== 'completed' ||
      !current.run.retrySource
    )
      return false;
    const { workId, runId } = current.run.retrySource;
    const sourceWork =
      workId === current.work.id ? current.work : await files.read(workId);
    const sourceRun = sourceWork.runs.find((r) => r.id === runId);
    if (!sourceRun) return false;
    const relatedWorks = new Map([[current.work.id, current.work]]);
    const related: RetryRunSummary[] = [];
    for (const ref of item.runs) {
      let work = relatedWorks.get(ref.workId);
      if (!work) {
        work = await files.read(ref.workId);
        relatedWorks.set(ref.workId, work);
      }
      const run = work.runs.find((r) => r.id === ref.runId);
      if (run) related.push(summarizeRun(run));
    }
    return hasUnretriedFailures(
      summarizeRun(current.run),
      summarizeRun(sourceRun),
      related,
    );
  }
  async function hasActiveChildren(parentId: string): Promise<boolean> {
    const items = await all();
    const byParent = new Map<string, WorkItem[]>();
    for (const entry of items) {
      if (!entry.parentId || !included(entry)) continue;
      const list = byParent.get(entry.parentId) ?? [];
      list.push(entry);
      byParent.set(entry.parentId, list);
    }
    const queue = [...(byParent.get(parentId) ?? [])];
    if (!queue.length) return false;
    const active = new Set(['queued', 'running', 'stopping']);
    const works = new Map<string, Map<string, Run['status']>>();
    while (queue.length) {
      const child = queue.shift()!;
      if (child.status !== 'completed') {
        const ref = child.runs.at(-1);
        if (ref) {
          let statuses = works.get(ref.workId);
          if (!statuses) {
            statuses = await files.select(
              ref.workId,
              (w) => new Map(w.runs.map((r) => [r.id, r.status] as const)),
            );
            works.set(ref.workId, statuses);
          }
          const runStatus = statuses.get(ref.runId);
          if (runStatus && active.has(runStatus)) return true;
        }
      }
      const nested = byParent.get(child.id);
      if (nested) queue.push(...nested);
    }
    return false;
  }
  async function view(item: WorkItem): Promise<WorkItemView> {
    const current = await execution(item);
    const status = current?.run.status;
    const activeChildren =
      item.status !== 'completed' &&
      !(status && ['queued', 'running', 'stopping', 'waiting'].includes(status))
        ? await hasActiveChildren(item.id)
        : false;
    const unretriedFailures = await itemUnretriedFailures(item, current);
    const effectiveStatus = effectiveItemStatus(item, status, {
      activeChildren,
      unretriedFailures,
    });
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
    expectedRevision?: number,
    lockKey = id,
  ): Promise<WorkItemView> {
    return serial(lockKey, async () => {
      const item = await read(id);
      if (expectedRevision !== undefined && item.revision !== expectedRevision)
        throw Object.assign(Error('工作项版本已变化，请读取最新状态后重试。'), {
          code: 'REVISION_CONFLICT',
        });
      await edit(item);
      item.revision++;
      item.updatedAt = timestamp();
      await save(item);
      return view(item);
    });
  }
  async function createRaw(
    input: CreateWorkItem,
    metadata: Partial<WorkItem> = {},
  ): Promise<WorkItemView> {
    const key =
        input.key?.trim() ||
        `WI-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 6)}`,
      title = required(input.title, '标题'),
      goal = required(input.goal, '目标');
    const criteria = texts(input.criteria ?? [], '完成条件');
    const materialText = texts(input.materials ?? [], '材料');
    if (input.key && (await all()).some((i) => i.key === key))
      throw Error('该业务编号已存在，请打开原工作项继续。');
    if (
      input.data !== undefined &&
      (!input.data ||
        typeof input.data !== 'object' ||
        Array.isArray(input.data))
    )
      throw Error('业务数据需要对象。');
    if (
      input.receivedInputs !== undefined &&
      (!Array.isArray(input.receivedInputs) ||
        input.receivedInputs.some(
          (value) =>
            !value ||
            typeof value.label !== 'string' ||
            value.value === undefined,
        ))
    )
      throw Error('交接输入需要明确名称和值。');
    const parentId = input.parentId ?? metadata.parentId;
    if (parentId)
      await children.reopenAncestors(
        await read(parentId),
        input.confirmReopen,
        true,
      );
    const privateWork = await createWorkService(files).createWork(goal, []);
    const itemId = randomUUID();
    await files.change(privateWork.id, (work) => {
      work.ownerItemId = itemId;
      work.title = title;
    });
    const at = timestamp();
    const item: WorkItem = {
      id: itemId,
      key,
      title,
      goal,
      workId: privateWork.id,
      inputBindings: {},
      deliveries: [],
      ...(input.parentId ? { parentId: input.parentId } : {}),
      receivedInputs: (input.receivedInputs ?? []).map((value) => ({
        ...structuredClone(value),
        id: randomUUID(),
      })),
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
      stage: '',
      summary: '',
      runs: [],
      history: [],
      createdAt: at,
      updatedAt: at,
      progressAt: at,
      ...metadata,
    };
    record(item, 'created', `登记工作项：${title}`);
    await save(item);
    return view(item);
  }
  const children = createChildrenService(
    { read, all, save, view, serial, record, createRaw },
    files,
  );
  const queries = createItemQueries({ all, read, version }, files);
  const preparation = createItemPreparation({ read, all }, files);
  const service = {
    /** Disk dependencies of the detail/workspace, without cloning business bodies. */
    async version(id: string, workspace = false) {
      const saved = await load(id),
        item = saved.item;
      const ids = workspace
        ? [
            item.workId,
            ...item.runs.map((r) => r.workId),
            ...item.deliveries.flatMap((d) => [
              d.workId,
              ...(d.composedSources?.map((s) => s.workId) ?? []),
            ]),
          ]
        : [item.runs.at(-1)?.workId];
      const dependencies = await Promise.all(
        [...new Set(ids.filter((id): id is string => !!id))].map(async (id) => {
          try {
            return await files.version(id);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            return `missing:${id}`;
          }
        }),
      );
      const uploads =
        workspace && item.workId ? await files.listUploads(item.workId) : [];
      return [saved.version, ...dependencies, JSON.stringify(uploads)].join(
        '|',
      );
    },
    /** Shared entry for workspace edits: serialize with lifecycle writes and reject stale proposals. */
    compositionChange(
      id: string,
      baseRevision: number,
      edit: (item: WorkItem) => void | Promise<void>,
    ) {
      return change(id, async (item) => {
        assertOpen(item);
        if (baseRevision !== item.revision)
          throw Object.assign(
            Error('工作项版本已变化，请读取最新状态后重试。'),
            {
              code: 'REVISION_CONFLICT',
            },
          );
        await edit(item);
      });
    },
    async reconcile() {
      for (const work of await files.list((w) => ({
        id: w.id,
        runs: w.runs.map((r) => ({
          id: r.id,
          definitionId: r.definitionId,
          workItem: r.workItem,
          effectMode: r.effectMode,
          parentCall: r.parentCall,
        })),
      })))
        for (const run of work.runs) {
          if (!run.workItem || run.effectMode !== 'commit' || run.parentCall)
            continue;
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
        review: 0,
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
    assertIdle: async (id: string) => assertIdle(await read(id)),
    candidates: children.candidates,
    candidatePage: children.candidatePage,
    createChildren: children.createChildren,
    scope: children.scope,
    reviseInput: children.reviseInput,
    ...queries,
    prepare: preparation.prepare,
    completionInputs: preparation.completionInputs,
    stagePreview: preparation.stagePreview,
    stageInputs: (
      id: string,
      scope?: import('./source-scope.ts').StageSourceScope,
    ) => childStageInputs(id, { read, all }, files, scope),
    async create(input: CreateWorkItem): Promise<WorkItemView> {
      return serial('$create', async () => {
        if (input.receivedInputs?.some((value) => value.source)) {
          if (!input.parentId)
            throw Error('来源材料需要从明确的上级工作项交接。');
          const parent = await read(input.parentId);
          for (const value of input.receivedInputs) {
            if (!value.source) continue;
            const { entry, run } = await readCandidateSource(files, {
              ...value.source,
              kind: 'output',
            });
            if (
              run.workItem?.id !== parent.id &&
              !parent.receivedInputs?.some((i) =>
                isDeepStrictEqual(i.source, value.source),
              )
            )
              throw Error('来源材料未交接给上级工作项。');
            if (!value.revised) value.value = structuredClone(entry.value);
            value.materials = entry.materialIds.map((id) => {
              const material = run.materials.find((m) => m.id === id);
              if (!material) throw Error(`来源材料 ${id} 不存在。`);
              return material;
            });
          }
        }
        return createRaw(input);
      });
    },
    addEvidence(id: string, materials: string[], expectedRevision?: number) {
      const additions = texts(materials, '材料');
      if (!additions.length) throw Error('请填写新增证据。');
      return change(
        id,
        (item) => {
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
        },
        expectedRevision,
      );
    },
    async citeCriterion(
      id: string,
      criterionId: string,
      criterionText: string,
      reference: CriterionReference,
    ) {
      return serial(id, async () => {
        const item = await read(id);
        assertOpen(item);
        const criterion = item.criteria.find(
          (criterion) => criterion.id === required(criterionId, '完成条件'),
        );
        if (!criterion) throw Error('完成条件已不存在，请重新选择。');
        if (criterion.text !== required(criterionText, '完成条件内容'))
          throw Error('完成条件已改变，请重新选择后添加证据。');
        if (
          !reference ||
          reference.port === undefined ||
          reference.index === undefined
        )
          throw Error('请选择具体产物后再引用。');
        const ref = await preparation.validateReference(item, {
          workId: required(reference.workId, '来源方法'),
          runId: required(reference.runId, '来源运行'),
          definitionId: required(reference.definitionId, '来源版本'),
          resultId: required(reference.resultId, '来源成果'),
          port: required(reference.port, '来源端口'),
          index: reference.index,
          label: required(reference.label, '来源标题'),
        });
        if (
          criterion.references?.some(
            (existing) =>
              existing.workId === ref.workId &&
              existing.runId === ref.runId &&
              existing.resultId === ref.resultId &&
              existing.port === ref.port &&
              existing.index === ref.index,
          )
        )
          return view(item);
        criterion.references = [...(criterion.references || []), ref];
        criterion.evidence = [criterion.evidence, ref.label]
          .filter(Boolean)
          .join('\n\n');
        record(
          item,
          'criteria',
          `为“${criterion.text}”添加成果依据：${ref.label}`,
          { criteria: structuredClone(item.criteria) },
        );
        item.revision++;
        item.updatedAt = timestamp();
        await save(item);
        return view(item);
      });
    },
    criteria(
      id: string,
      criteria: CompletionCriterion[],
      expectedRevision?: number,
    ) {
      return change(
        id,
        async (item) => {
          assertOpen(item);
          if (
            !Array.isArray(criteria) ||
            criteria.some(
              (criterion) =>
                !criterion ||
                typeof criterion.id !== 'string' ||
                !criterion.id.trim(),
            ) ||
            new Set(criteria.map((criterion) => criterion.id)).size !==
              criteria.length
          )
            throw Error('完成条件编号重复或无效，请重新检查。');
          for (const criterion of criteria) {
            if (
              criterion.references !== undefined &&
              !Array.isArray(criterion.references)
            )
              throw Error('条件来源引用无效。');
            for (const ref of criterion.references ?? [])
              await preparation.validateReference(item, ref);
          }
          item.criteria = criteria.map((criterion) => {
            const text = required(criterion.text, '完成条件');
            if (
              typeof criterion.met !== 'boolean' ||
              typeof criterion.evidence !== 'string'
            )
              throw Error('完成条件内容无效。');
            const saved = item.criteria.find(
              (entry) => entry.id === criterion.id,
            );
            const changed = !saved || saved.text !== text;
            if (changed)
              return { id: criterion.id, text, met: false, evidence: '' };
            const evidence = criterion.evidence.trim();
            if (criterion.met && !evidence)
              throw Error(`请为“${text}”填写满足条件的依据。`);
            if (
              criterion.references !== undefined &&
              !Array.isArray(criterion.references)
            )
              throw Error('条件来源引用无效。');
            const references = criterion.references?.map((ref) => ({
              workId: required(ref.workId, '来源方法'),
              runId: required(ref.runId, '来源运行'),
              definitionId: required(ref.definitionId, '来源版本'),
              resultId: required(ref.resultId, '来源成果'),
              label: required(ref.label, '来源标题'),
              ...(ref.port !== undefined
                ? { port: ref.port, index: ref.index }
                : {}),
              ...(ref.nodeId
                ? { nodeId: required(ref.nodeId, '来源步骤') }
                : {}),
              ...(ref.instanceId
                ? { instanceId: required(ref.instanceId, '来源实例') }
                : {}),
            }));
            return {
              id: criterion.id,
              text,
              met: criterion.met,
              evidence,
              ...(references ? { references } : {}),
            };
          });
          record(
            item,
            'criteria',
            `保存完成条件 ${item.criteria.filter((c) => c.met).length} / ${item.criteria.length}`,
            { criteria: structuredClone(item.criteria) },
          );
        },
        expectedRevision,
      );
    },
    complete(id: string, expectedRevision?: number) {
      return change(
        id,
        async (item) => {
          assertOpen(item);
          await assertIdle(item);
          const childItems = (await all()).filter(
            (child) => child.parentId === id && included(child),
          );
          if (childItems.some((child) => child.status !== 'completed'))
            throw Error('范围内仍有未完成子项。');
          if (
            (!item.criteria.length && !childItems.length) ||
            item.criteria.some((c) => !c.met || !c.evidence.trim())
          )
            throw Error('仍有未满足或缺少依据的完成条件。');
          item.status = 'completed';
          delete item.nextAction;
          delete item.blocker;
          item.stage = '已结项';
          item.summary = '所有完成条件已确认并记录依据。';
          record(item, 'completed', item.summary, {
            completionTitle: item.title,
            completionGoal: item.goal,
            completionData: structuredClone(item.data),
            confirmedScope: childItems.map((child) => child.id),
            childCompletions: childItems.map((child) => ({
              itemId: child.id,
              completionHistoryId: child.history
                .filter((h) => h.kind === 'completed')
                .at(-1)!.id,
            })),
            criteria: structuredClone(item.criteria),
          });
        },
        expectedRevision,
        '$tree',
      );
    },
    reopen(
      id: string,
      reason: string,
      confirmReopen = false,
      expectedRevision?: number,
    ) {
      const text = required(reason, '重新打开的原因');
      return change(
        id,
        async (item) => {
          if (item.status !== 'completed') throw Error('工作项尚未结项。');
          await children.reopenAncestors(item, confirmReopen);
          item.status = 'open';
          delete item.nextAction;
          delete item.blocker;
          item.stage = '待重新评估';
          item.summary = text;
          item.criteria = item.criteria.map((c) => ({ ...c, met: false }));
          record(item, 'reopened', text);
        },
        expectedRevision,
        '$tree',
      );
    },
    context: async (id: string) => {
      const item = await read(id);
      const prepared = await resolveItemInputs(
        item,
        item.inputBindings,
        files,
        { readItem: read },
      );
      return {
        workItem: {
          ...prepared.workItem,
          materials: structuredClone(item.materials),
          receivedInputs: structuredClone(item.receivedInputs ?? []),
        },
        inputs: prepared.inputs,
      };
    },
    launch(
      id: string,
      start: (
        input: WorkItemInput,
        workId: string,
        item: WorkItem,
      ) => Promise<ItemRunRef>,
      expectedRevision: number,
    ) {
      return change(
        id,
        async (item) => {
          assertOpen(item);
          await assertIdle(item);
          const input: WorkItemInput = {
            id: item.id,
            key: item.key,
            title: item.title,
            goal: item.goal,
            revision: item.revision,
            data: structuredClone(item.data),
            materials: structuredClone(item.materials),
            receivedInputs: structuredClone(item.receivedInputs ?? []),
          };
          const ref = await start(input, item.workId, item);
          item.runs.push(ref);
          delete item.nextAction;
          delete item.blocker;
          record(item, 'run', '发起正式推进', { source: ref });
        },
        expectedRevision,
      );
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
        if (structuredProgress(summary))
          throw Error(
            '进展摘要请填写可读的业务说明；结构化结果请作为成果或材料提交。',
          );
        assertOpen(item);
        let allowedMaterials = item.materials;
        if (source) {
          const current = await execution(item);
          const sourceWork = await files.read(source.workId);
          const run = sourceWork.runs.find((r) => r.id === source!.runId);
          let rootRun = run,
            rootWorkId = source.workId;
          const seen = new Set<string>();
          while (rootRun?.parentCall) {
            const parent = rootRun.parentCall;
            if (seen.has(parent.runId)) throw Error('调用运行关联循环。');
            seen.add(parent.runId);
            rootWorkId = parent.workId;
            rootRun = (await files.read(parent.workId)).runs.find(
              (r) => r.id === parent.runId,
            );
          }
          if (
            !current ||
            !run ||
            run.definitionId !== source.definitionId ||
            run.workItem?.id !== item.id ||
            rootWorkId !== current.ref.workId ||
            rootRun?.id !== current.ref.runId
          )
            throw Error('报告来源不属于本工作项当前正式运行。');
          if (
            run.stopRequested ||
            rootRun?.stopRequested ||
            !['queued', 'running', 'waiting'].includes(run.status) ||
            !rootRun ||
            !['queued', 'running', 'waiting'].includes(rootRun.status)
          )
            throw Error('运行已停止或结束，不能报告进展。');
          if (
            (typeof run.scope === 'object' &&
              run.scope.nodeId !== source.nodeId) ||
            run.effectMode !== 'commit' ||
            run.comparisonId
          )
            throw Error('只有正式工作项执行的当前步骤可以报告进展。');
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
