import { effectiveItemStatus } from '../../shared/workitem-status';
import type { FileStore } from '../files/index.ts';
import type {
  WorkItem,
  WorkItemSummary,
  WorkItemSummaryPage,
  WorkItemSummaryRow,
} from '../../shared/records.ts';
import { included } from './children.ts';
export interface ItemQuery {
  query?: string;
  status?: string;
  parentId?: string;
  rootId?: string;
  view?: string;
  todo?: string;
  page?: number;
  pageSize?: number;
  ids?: string[];
}
function summary(rows: WorkItemSummaryRow[]): WorkItemSummary {
  const result: WorkItemSummary = {
    total: rows.length,
    pending: 0,
    review: 0,
    open: 0,
    running: 0,
    waiting: 0,
    attention: 0,
    completed: 0,
  };
  for (const row of rows) {
    result[row.effectiveStatus]++;
    if (row.status !== 'completed') result.pending++;
  }
  return result;
}
export function createItemQueries(
  ctx: {
    all(): Promise<WorkItem[]>;
    read(id: string): Promise<WorkItem>;
    version(): Promise<string>;
  },
  files: FileStore,
) {
  let methodVersion = 0;
  let projection:
    | {
        version: string;
        value: Promise<{
          rows: WorkItemSummaryRow[];
          byId: Map<string, WorkItem>;
        }>;
      }
    | undefined;
  files.onChange(() => {
    methodVersion++;
    projection = undefined;
  });
  async function project() {
    const items = await ctx.all(),
      byId = new Map(items.map((i) => [i.id, i])),
      children = new Map<string, WorkItem[]>();
    for (const item of items)
      if (item.parentId) {
        const list = children.get(item.parentId) ?? [];
        list.push(item);
        children.set(item.parentId, list);
      }
    const works = new Map<
      string,
      Promise<{
        runs: {
          id: string;
          status: import('../../shared/records.ts').Run['status'];
        }[];
      }>
    >();
    function method(id: string) {
      if (!works.has(id))
        works.set(
          id,
          files.select(id, (work) => ({
            runs: work.runs.map((r) => ({ id: r.id, status: r.status })),
          })),
        );
      return works.get(id)!;
    }
    const rows = await Promise.all(
      items.map(async (item): Promise<WorkItemSummaryRow> => {
        const ref = item.runs.at(-1),
          run = ref
            ? (await method(ref.workId)).runs.find((r) => r.id === ref.runId)
            : undefined;
        const status = run?.status;
        const effectiveStatus = effectiveItemStatus(item, status);
        const scopeChildren = (children.get(item.id) ?? []).filter(included),
          childCount = scopeChildren.length,
          completedChildCount = scopeChildren.filter(
            (i) => i.status === 'completed',
          ).length;
        const todo =
          item.status === 'completed'
            ? undefined
            : effectiveStatus === 'running'
              ? 'running'
              : effectiveStatus === 'waiting' || status === 'interrupted'
                ? 'waiting'
                : item.blocker
                  ? 'blocked'
                  : effectiveStatus === 'review'
                    ? 'review'
                    : effectiveStatus === 'attention'
                      ? 'process'
                      : childCount && childCount === completedChildCount
                        ? 'confirm'
                        : !childCount
                          ? 'process'
                          : undefined;
        const completion =
          item.status === 'completed'
            ? item.history.filter((h) => h.kind === 'completed').at(-1)
            : undefined;
        return {
          id: item.id,
          key: item.key,
          title: item.title,
          goal: item.goal,
          parentId: item.parentId,
          parentTitle: item.parentId
            ? byId.get(item.parentId)?.title
            : undefined,
          parentScope: item.parentScope,
          status: item.status,
          effectiveStatus,
          stage: item.stage,
          summary: item.summary,
          blocker: item.blocker,
          nextAction: item.nextAction,
          workId: item.workId,
          progressAt: item.progressAt,
          createdAt: item.createdAt,
          runs: item.runs,
          childCount,
          completedChildCount,
          todo,
          completion: completion
            ? { itemId: item.id, completionHistoryId: completion.id }
            : undefined,
          execution: run && ref ? { ...ref, status: run.status } : undefined,
        };
      }),
    );
    return { rows, byId };
  }
  async function summaries(
    options: ItemQuery = {},
  ): Promise<WorkItemSummaryPage> {
    const current = `${await ctx.version()}:${methodVersion}`;
    if (!projection || projection.version !== current) {
      const entry = { version: current, value: project() };
      projection = entry;
      void entry.value.catch(() => {
        if (projection === entry) projection = undefined;
      });
    }
    const { rows, byId } = await projection.value;
    // Global pages request business roots; scoped/id readers still see children.
    const listed =
      options.view === 'roots' ? rows.filter((row) => !row.parentId) : rows;
    const global = summary(listed);
    function under(item: WorkItem, rootId: string, includeExcluded = false) {
      let current = item;
      const seen = new Set<string>();
      while (current.parentId && !seen.has(current.id)) {
        seen.add(current.id);
        if (!includeExcluded && !included(current)) return false;
        if (current.parentId === rootId) return true;
        const parent = byId.get(current.parentId);
        if (!parent) return false;
        current = parent;
      }
      return false;
    }
    let scoped = listed.filter((row) => {
      const item = byId.get(row.id)!;
      if (options.ids && !options.ids.includes(row.id)) return false;
      if (options.parentId && item.parentId !== options.parentId) return false;
      if (
        options.rootId &&
        options.view === 'children' &&
        item.parentId !== options.rootId
      )
        return false;
      if (
        options.rootId &&
        !under(item, options.rootId, options.view === 'excluded')
      )
        return false;
      if (options.view === 'excluded') return !included(item);
      if ((options.parentId || options.rootId) && !included(item)) return false;
      return true;
    });
    const scopeSummary = summary(scoped),
      todoTotal = scoped.filter((i) => i.todo).length;
    if (options.view === 'todo') scoped = scoped.filter((i) => i.todo);
    if (options.todo && options.todo !== 'all')
      scoped = scoped.filter((i) => i.todo === options.todo);
    if (options.status && options.status !== 'all')
      scoped = scoped.filter((i) =>
        options.status === 'pending'
          ? i.status !== 'completed'
          : i.effectiveStatus === options.status,
      );
    if (options.query?.trim()) {
      const query = options.query.trim().toLowerCase();
      scoped = scoped.filter((i) =>
        `${i.key} ${i.title} ${i.goal} ${i.parentTitle ?? ''} ${i.stage}`
          .toLowerCase()
          .includes(query),
      );
    }
    const query = options.query?.trim().toLowerCase();
    const matchPriority = (row: WorkItemSummaryRow) =>
      !query
        ? 0
        : row.key.toLowerCase() === query || row.title.toLowerCase() === query
          ? 0
          : row.key.toLowerCase().includes(query) ||
              row.title.toLowerCase().includes(query)
            ? 1
            : 2;
    scoped.sort(
      (a, b) =>
        matchPriority(a) - matchPriority(b) ||
        b.progressAt.localeCompare(a.progressAt) ||
        a.id.localeCompare(b.id),
    );
    const page = Math.max(1, options.page ?? 1),
      pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25)),
      total = scoped.length;
    return {
      items: structuredClone(
        options.ids
          ? scoped
          : scoped.slice((page - 1) * pageSize, page * pageSize),
      ),
      total,
      page,
      pageSize,
      summary: global,
      scopeSummary,
      todoTotal,
    };
  }
  return { summaries };
}
