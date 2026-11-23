import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  WorkItemRunSelection,
  WorkItemView,
} from '../../shared/records.ts';

type BatchEntry = {
  itemId: string;
  selection: WorkItemRunSelection;
  status:
    | 'pending'
    | 'starting'
    | 'running'
    | 'completed'
    | 'failed'
    | 'waiting'
    | 'interrupted'
    | 'cancelled';
  previousRuns?: string[];
  runId?: string;
  error?: string;
};
type Batch = {
  id: string;
  parentId: string;
  title: string;
  status: 'running' | 'paused' | 'completed';
  concurrency: number;
  failures: number;
  entries: BatchEntry[];
  createdAt: string;
  updatedAt: string;
  reason?: string;
};
type Input = {
  parentId: string;
  title: string;
  concurrency?: number;
  entries: {
    itemId: string;
    selection: WorkItemRunSelection;
    runId?: string;
  }[];
};
/** 持久批次只编排正式工作项启动；流水线本身依旧负责执行、停止和产物。 */
export function createBatchRuns(
  root: string,
  getItem: (id: string) => Promise<WorkItemView>,
  startItem: (
    id: string,
    selection: WorkItemRunSelection,
  ) => Promise<WorkItemView>,
  pollIntervalMs = 5000,
) {
  const dir = join(root, 'work-item-batches');
  const batches = new Map<string, Batch>();
  let timer: NodeJS.Timeout | undefined;
  let busy = false;
  let closed = false;
  let writes: Promise<void> = Promise.resolve();
  let creating = false;
  async function save(batch: Batch) {
    batch.updatedAt = new Date().toISOString();
    const snapshot = JSON.stringify(batch);
    const write = writes
      .catch(() => {})
      .then(async () => {
        await mkdir(dir, { recursive: true });
        const path = join(dir, `${batch.id}.json`),
          temp = `${path}.${randomUUID()}.tmp`;
        await writeFile(temp, snapshot, { flag: 'wx', mode: 0o600 });
        await rename(temp, path);
      });
    writes = write;
    await write;
  }
  function schedule(ms = 0) {
    if (closed || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void pump();
    }, ms);
    timer.unref();
  }
  const needsObservation = (batch: Batch) =>
    batch.status === 'running' ||
    batch.entries.some((entry) =>
      ['starting', 'running', 'waiting', 'interrupted'].includes(entry.status),
    );
  async function refresh(entry: BatchEntry) {
    const item = await getItem(entry.itemId);
    if (entry.status === 'starting') {
      const added = item.runs.filter(
        (r) => !entry.previousRuns?.includes(r.runId),
      );
      if (added.length > 1)
        throw Error('启动期间产生多个运行，请人工检查后续处理。');
      if (!added.length) {
        entry.status = 'pending';
        delete entry.previousRuns;
        return;
      }
      entry.runId = added[0].runId;
      entry.status = 'running';
    }
    if (!['running', 'waiting', 'interrupted'].includes(entry.status)) return;
    if (!item.execution || item.execution.runId !== entry.runId)
      throw Error('工作项当前运行已变化，请人工检查后续处理。');
    const state = item.execution.status;
    if (['queued', 'running', 'stopping'].includes(state))
      entry.status = 'running';
    else if (state === 'completed') {
      entry.status = 'completed';
    } else if (
      state === 'failed' ||
      state === 'cancelled' ||
      state === 'interrupted' ||
      state === 'waiting'
    ) {
      entry.status = state;
      entry.error = item.execution.error;
    }
  }
  async function pump() {
    if (busy || closed) return;
    busy = true;
    try {
      for (const batch of batches.values()) {
        if (batch.status === 'completed') continue;
        for (const entry of batch.entries.filter(
          (e) =>
            e.status === 'running' ||
            e.status === 'starting' ||
            e.status === 'waiting' ||
            e.status === 'interrupted',
        )) {
          const old = entry.status;
          try {
            await refresh(entry);
          } catch (error) {
            batch.status = 'paused';
            batch.reason =
              error instanceof Error ? error.message : String(error);
            await save(batch);
            break;
          }
          if (entry.status !== old) {
            if (entry.status === 'failed') batch.failures++;
            else if (entry.status === 'completed') batch.failures = 0;
            if (batch.failures >= 3) {
              batch.status = 'paused';
              batch.reason = '连续三个工作项运行失败，请检查后再继续。';
            }
            await save(batch);
          }
        }
        if (batch.status !== 'running') continue;
        let active = batch.entries.filter(
          (e) => e.status === 'running' || e.status === 'starting',
        ).length;
        while (active < batch.concurrency && batch.status === 'running') {
          const entry = batch.entries.find((e) => e.status === 'pending');
          if (!entry) break;
          try {
            const item = await getItem(entry.itemId);
            if (
              item.execution &&
              [
                'queued',
                'running',
                'stopping',
                'waiting',
                'interrupted',
              ].includes(item.execution.status)
            )
              throw Error('工作项已有未结束的运行。');
            entry.previousRuns = item.runs.map((r) => r.runId);
            entry.status = 'starting';
            await save(batch);
            if (batch.status !== 'running') {
              entry.status = 'pending';
              await save(batch);
              break;
            }
            const started = await startItem(entry.itemId, entry.selection);
            const ref = started.runs.at(-1);
            if (
              !ref ||
              !started.execution ||
              started.execution.runId !== ref.runId
            )
              throw Error('启动结果缺少运行关联。');
            entry.runId = ref.runId;
            entry.status = 'running';
            delete entry.previousRuns;
            active++;
            await save(batch);
          } catch (error) {
            // 不猜测启动是否提交：starting 在下一次检查时与已有运行对账。
            if (entry.status === 'starting') {
              batch.status = 'paused';
              batch.reason = `启动状态待核对：${error instanceof Error ? error.message : String(error)}`;
            } else {
              entry.status = 'failed';
              entry.error =
                error instanceof Error ? error.message : String(error);
              batch.failures++;
              if (batch.failures >= 3) {
                batch.status = 'paused';
                batch.reason = '连续三个工作项启动失败，请检查后再继续。';
              }
            }
            await save(batch);
          }
        }
        if (
          batch.status === 'running' &&
          batch.entries.every(
            (e) =>
              ![
                'pending',
                'starting',
                'running',
                'waiting',
                'interrupted',
              ].includes(e.status),
          )
        ) {
          batch.status = 'completed';
          await save(batch);
        }
      }
    } catch (error) {
      console.error(
        '批次调度失败：',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      busy = false;
      if ([...batches.values()].some(needsObservation))
        schedule(pollIntervalMs);
    }
  }
  return {
    async recover() {
      await mkdir(dir, { recursive: true });
      for (const name of await readdir(dir))
        if (/^[a-f0-9-]+\.json$/.test(name)) {
          const batch = JSON.parse(
            await readFile(join(dir, name), 'utf8'),
          ) as Batch;
          batches.set(batch.id, batch);
        }
      if ([...batches.values()].some(needsObservation)) schedule();
    },
    list(parentId?: string) {
      return [...batches.values()]
        .filter((b) => !parentId || b.parentId === parentId)
        .map((b) => ({
          id: b.id,
          parentId: b.parentId,
          title: b.title,
          status: b.status,
          reason: b.reason,
          concurrency: b.concurrency,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
          counts: Object.fromEntries(
            [
              'pending',
              'starting',
              'running',
              'completed',
              'failed',
              'waiting',
              'interrupted',
              'cancelled',
            ].map((s) => [s, b.entries.filter((e) => e.status === s).length]),
          ),
        }));
    },
    get(id: string) {
      const batch = batches.get(id);
      if (!batch) throw Error('批次不存在。');
      return structuredClone(batch);
    },
    async create(input: Input) {
      if (creating) throw Error('正在创建批次，请稍后重试。');
      creating = true;
      try {
        if (
          !input.parentId ||
          !input.title?.trim() ||
          !Array.isArray(input.entries) ||
          !input.entries.length
        )
          throw Error('批次需要上级、名称和工作项。');
        const concurrency = input.concurrency ?? 2;
        if (
          !Number.isInteger(concurrency) ||
          concurrency < 1 ||
          concurrency > 4
        )
          throw Error('批次并发需要为 1 到 4。');
        if (
          new Set(input.entries.map((e) => e.itemId)).size !==
          input.entries.length
        )
          throw Error('批次工作项重复。');
        if (
          [...batches.values()].some(
            (b) => b.parentId === input.parentId && b.status !== 'completed',
          )
        )
          throw Error('当前工作项已有未结束的批次。');
        await getItem(input.parentId);
        const selected = new Set(input.entries.map((entry) => entry.itemId));
        if (
          [...batches.values()].some(
            (batch) =>
              batch.status !== 'completed' &&
              batch.entries.some(
                (entry) =>
                  selected.has(entry.itemId) &&
                  ['pending', 'starting', 'running', 'waiting'].includes(
                    entry.status,
                  ),
              ),
          )
        )
          throw Error('所选工作项已在其他未结束的批次中。');
        for (const entry of input.entries)
          if (
            !entry.itemId ||
            !entry.selection.definitionId ||
            !entry.selection.inputBindings
          )
            throw Error('批次工作项缺少明确的处理方法、版本或输入。');
        const now = new Date().toISOString();
        const batch: Batch = {
          id: randomUUID(),
          parentId: input.parentId,
          title: input.title.trim(),
          status: 'running',
          concurrency,
          failures: 0,
          createdAt: now,
          updatedAt: now,
          entries: input.entries.map((e) => ({
            itemId: e.itemId,
            selection: e.selection,
            status: e.runId ? 'running' : 'pending',
            ...(e.runId ? { runId: e.runId } : {}),
          })),
        };
        await save(batch);
        batches.set(batch.id, batch);
        schedule();
        return structuredClone(batch);
      } finally {
        creating = false;
      }
    },
    async action(id: string, action: 'pause' | 'resume') {
      const batch = batches.get(id);
      if (!batch) throw Error('批次不存在。');
      if (action === 'pause') {
        if (batch.status === 'completed') throw Error('批次已结束。');
        batch.status = 'paused';
        batch.reason = '已暂停后续启动。';
      } else if (action === 'resume') {
        if (batch.status !== 'paused') throw Error('只有暂停的批次可以继续。');
        batch.status = 'running';
        batch.failures = 0;
        delete batch.reason;
      } else throw Error('未知批次操作。');
      await save(batch);
      if (batch.status === 'running') schedule();
      return structuredClone(batch);
    },
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
    },
  };
}
