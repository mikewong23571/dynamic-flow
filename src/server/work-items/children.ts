import { validateValue } from '../flow/schema.ts';
import { parseCandidates } from '../../shared/workitem-candidates.ts';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { FileStore } from '../files/index.ts';
import type {
  CandidateSource,
  ChildCreationReceipt,
  CreateChildrenRequest,
  CreateWorkItem,
  ItemHistory,
  Json,
  OutputReference,
  ReceivedItemInput,
  WorkItem,
  WorkItemCandidate,
  WorkItemView,
  Work,
} from '../../shared/records.ts';

export interface ItemStorage {
  read(id: string): Promise<WorkItem>;
  all(): Promise<WorkItem[]>;
  save(item: WorkItem): Promise<void>;
  view(item: WorkItem): Promise<WorkItemView>;
  serial<T>(key: string, operation: () => Promise<T>): Promise<T>;
  record(
    item: WorkItem,
    kind: ItemHistory['kind'],
    summary: string,
    extra?: Partial<ItemHistory>,
  ): void;
  createRaw(
    input: CreateWorkItem,
    metadata?: Partial<WorkItem>,
  ): Promise<WorkItemView>;
}
export const included = (item: WorkItem) =>
  item.parentScope?.status !== 'excluded';
export function touch(item: WorkItem) {
  item.revision++;
  item.updatedAt = new Date().toISOString();
}
export async function readCandidateSource(
  files: FileStore,
  source: CandidateSource,
  workCache?: Map<string, Promise<Work>>,
) {
  if (
    !source ||
    !['output', 'node-input'].includes(source.kind) ||
    !Number.isInteger(source.index) ||
    source.index < 0 ||
    [source.workId, source.runId, source.resultId, source.port].some(
      (v) => typeof v !== 'string' || !v,
    )
  )
    throw Error('候选来源不完整。');
  if (workCache && !workCache.has(source.workId))
    workCache.set(source.workId, files.read(source.workId));
  const work = await (workCache?.get(source.workId) ??
      files.read(source.workId)),
    run = work.runs.find((r) => r.id === source.runId),
    result = run?.results.find((r) => r.id === source.resultId);
  if (!run || !result) throw Error('候选来源不存在。');
  if (source.kind === 'output' && result.status !== 'completed')
    throw Error('候选成果尚未完成。');
  const entry = (source.kind === 'output' ? result.outputs : result.input)[
    source.port
  ]?.[source.index];
  if (!entry) throw Error('候选来源中的指定项不存在。');
  return { entry, run, result };
}
export function createChildrenService(ctx: ItemStorage, files: FileStore) {
  async function ancestors(item: WorkItem, includeSelf = false) {
    const result: WorkItem[] = [];
    let current = item;
    if (includeSelf) result.push(current);
    while (current.parentId && included(current)) {
      current = await ctx.read(current.parentId);
      result.push(current);
    }
    return result;
  }
  async function reopenAncestors(
    item: WorkItem,
    confirmed = false,
    includeSelf = false,
  ) {
    const affected = (await ancestors(item, includeSelf)).filter(
      (i) => i.status === 'completed',
    );
    if (affected.length && !confirmed)
      throw Object.assign(Error('此操作需要同时重新打开已结项的上级工作项。'), {
        affectedAncestors: affected.map((i) => ({ id: i.id, title: i.title })),
      });
    for (const ancestor of affected) {
      ancestor.status = 'open';
      ancestor.stage = '待重新评估';
      ancestor.criteria = ancestor.criteria.map((c) => ({ ...c, met: false }));
      delete ancestor.blocker;
      delete ancestor.nextAction;
      ctx.record(ancestor, 'reopened', `子项范围或结论变化：${item.title}`);
      touch(ancestor);
      await ctx.save(ancestor);
    }
  }
  async function candidates(
    parentId: string,
    source: CandidateSource,
    workCache?: Map<string, Promise<Work>>,
  ) {
    const { entry, run } = await readCandidateSource(files, source, workCache);
    const parent = await ctx.read(parentId);
    if (
      run.workItem?.id !== parentId &&
      !parent.receivedInputs?.some(
        (i) =>
          i.source &&
          isDeepStrictEqual(i.source, (({ kind, ...s }) => s)(source)),
      )
    )
      throw Error('候选清单未交接给当前工作项。');
    const list = parseCandidates(entry.value);
    const receipts = (await ctx.read(parentId)).history
      .flatMap((h) => h.childLinks ?? [])
      .filter((r) => isDeepStrictEqual(r.source, source));
    const latest = new Map<string, ChildCreationReceipt>();
    for (const receipt of receipts) {
      const previous = latest.get(receipt.candidateId);
      latest.set(
        receipt.candidateId,
        receipt.childId || !previous?.childId ? receipt : previous,
      );
    }
    for (const child of await ctx.all())
      if (
        child.parentId === parentId &&
        child.origin &&
        isDeepStrictEqual(child.origin.source, source) &&
        !latest.get(child.origin.candidateId)?.childId
      )
        latest.set(child.origin.candidateId, {
          candidateId: child.origin.candidateId,
          status: 'linked',
          childId: child.id,
          source,
        });
    return { candidates: list, receipts: [...latest.values()] };
  }
  async function candidatePage(
    parentId: string,
    source: CandidateSource,
    page = 1,
    pageSize = 25,
  ) {
    const loaded = await candidates(parentId, source);
    const current = Math.max(1, Number.isFinite(page) ? page : 1),
      size = Math.min(
        100,
        Math.max(1, Number.isFinite(pageSize) ? pageSize : 25),
      );
    return {
      ...loaded,
      candidates: loaded.candidates.slice((current - 1) * size, current * size),
      candidateIds: loaded.candidates.map((c) => c.id),
      total: loaded.candidates.length,
      page: current,
      pageSize: size,
    };
  }
  async function createChildren(
    parentId: string,
    request: CreateChildrenRequest,
    signal?: AbortSignal,
  ) {
    return ctx.serial('$hierarchy', async () => {
      signal?.throwIfAborted();
      let parent = await ctx.read(parentId);
      const workCache = new Map<string, Promise<Work>>();
      const loaded = request.source
        ? await candidates(parentId, request.source, workCache)
        : undefined;
      let list = loaded?.candidates ?? request.candidates;
      if (!Array.isArray(list)) throw Error('请提供子问题清单。');
      if (request.candidateIds)
        list = list.filter((c) => request.candidateIds!.includes(c.id));
      const edits = new Map((request.edits ?? []).map((c) => [c.id, c]));
      list = list.map((c) => edits.get(c.id) ?? c);
      if (new Set(list.map((c) => c.id)).size !== list.length)
        throw Error('候选编号重复。');
      const records = await ctx.all(),
        children = records.filter((i) => i.parentId === parentId);
      const receipts: ChildCreationReceipt[] = [];
      async function candidateInputs(candidate: WorkItemCandidate) {
        if (!Array.isArray(candidate.inputs))
          throw Error('子问题输入需要列表。');
        return Promise.all(
          candidate.inputs.map(async (input, inputIndex) => {
            if (
              !input ||
              typeof input.label !== 'string' ||
              input.value === undefined
            )
              throw Error('子问题输入缺少名称或值。');
            const source =
              input.source ??
              (request.source?.kind === 'output'
                ? (({ kind, ...ref }) => ref)(request.source)
                : undefined);
            const origin = request.source
              ? {
                  source: request.source,
                  candidateId: candidate.id,
                  inputIndex,
                }
              : undefined;
            if (!source)
              return {
                ...structuredClone(input),
                ...(origin ? { origin } : {}),
              };
            const { entry, run } = await readCandidateSource(
              files,
              {
                ...source,
                kind: 'output',
              },
              workCache,
            );
            if (
              run.workItem?.id !== parentId &&
              !parent.receivedInputs?.some((i) =>
                isDeepStrictEqual(i.source, source),
              )
            )
              throw Error('输入来源未交接给父项。');
            const materials = entry.materialIds.map((id) => {
              const material = run.workItem?.materials.find((i) => i.id === id);
              if (!material) throw Error(`来源材料 ${id} 不存在。`);
              return material;
            });
            return {
              ...structuredClone(input),
              source,
              materials,
              ...(origin ? { origin } : {}),
            };
          }),
        );
      }
      for (const candidate of list) {
        if (signal?.aborted) break;
        const receipt: ChildCreationReceipt = {
          candidateId: candidate.id,
          status: 'failed',
          ...(request.source ? { source: request.source } : {}),
        };
        try {
          const existingLink = loaded?.receipts.find(
            (r) => r.candidateId === candidate.id && r.childId,
          );
          let existing = existingLink
            ? children.find((c) => c.id === existingLink.childId)
            : children.find(
                (c) =>
                  request.source &&
                  c.origin?.candidateId === candidate.id &&
                  isDeepStrictEqual(c.origin.source, request.source),
              );
          if (candidate.existingChildId) {
            if (existing && existing.id !== candidate.existingChildId)
              throw Error('该来源已经关联其他子项，不能重新指定。');
            existing = children.find((c) => c.id === candidate.existingChildId);
            if (!existing) throw Error('只能关联当前父项下的子项。');
          }
          if (!existing && candidate.trackingKey)
            existing = children.find(
              (c) => c.trackingKey === candidate.trackingKey,
            );
          if (
            existing &&
            !existingLink &&
            !candidate.existingChildId &&
            candidate.trackingKey &&
            (existing.goal !== candidate.goal ||
              (candidate.data !== undefined &&
                !isDeepStrictEqual(existing.data, candidate.data)))
          )
            throw Error(
              '相同跟踪标识对应的目标不同，请明确关联已有项或修改标识。',
            );
          if (existing) {
            receipt.status = 'linked';
            receipt.childId = existing.id;
            receipt.inputsAppended = existingLink?.inputsAppended;
            if (request.appendInputs) {
              if (!request.source) throw Error('请从明确候选来源补充材料。');
              const received = await candidateInputs(candidate);
              const additions = received
                .filter(
                  (input) =>
                    !existing.receivedInputs?.some(
                      (saved) =>
                        input.origin &&
                        isDeepStrictEqual(saved.origin, input.origin),
                    ),
                )
                .map((input) => ({ ...input, id: randomUUID() }));
              if (additions.length) {
                if (existing.status === 'completed')
                  throw Error('请先重新打开子项，再补充材料。');
                existing.receivedInputs = [
                  ...(existing.receivedInputs ?? []),
                  ...additions,
                ];
                const bindings = existing.inputBindings;
                if (bindings && Object.keys(bindings).length === 1)
                  Object.values(bindings)[0].push(
                    ...additions.map((input) => ({
                      kind: 'received' as const,
                      inputId: input.id,
                    })),
                  );
                ctx.record(
                  existing,
                  'input',
                  `接收 ${additions.length} 份材料`,
                );
                touch(existing);
                await ctx.save(existing);
              }
              receipt.inputsAppended = true;
            }
          } else {
            if (!candidate.title?.trim() || !candidate.goal?.trim()) {
              receipt.status = 'needs-input';
              throw Error('请补充子问题标题和目标。');
            }
            signal?.throwIfAborted();
            const inputs = await candidateInputs(candidate);
            const child = await ctx.createRaw(
              {
                title: candidate.title,
                goal: candidate.goal,
                criteria: candidate.criteria ?? [],
                materials: [],
                data: candidate.data,
                receivedInputs: inputs,
                confirmReopen: request.confirmReopen,
              },
              {
                parentId,
                parentScope: {
                  status: 'included',
                  at: new Date().toISOString(),
                },
                ...(request.source
                  ? {
                      origin: {
                        source: request.source,
                        candidateId: candidate.id,
                      },
                    }
                  : {}),
                ...(candidate.trackingKey
                  ? { trackingKey: candidate.trackingKey }
                  : {}),
              },
            );
            parent = await ctx.read(parentId);
            children.push(child);
            receipt.status = 'created';
            receipt.childId = child.id;
          }
        } catch (error) {
          if (error instanceof Error && 'affectedAncestors' in error)
            throw error;
          if (receipt.status === 'linked') receipt.status = 'failed';
          receipt.error =
            error instanceof Error ? error.message : String(error);
        }
        receipts.push(receipt);
      }
      // Each child is already durable. One action records the completed prefix;
      // a lost parent receipt is reconstructed from child.origin on re-entry.
      if (receipts.length) {
        try {
          ctx.record(parent, 'children', `处理 ${receipts.length} 个子问题`, {
            childLinks: receipts,
          });
          touch(parent);
          await ctx.save(parent);
        } catch (error) {
          receipts[0].status = 'failed';
          receipts[0].error = `子项回执保存失败：${error instanceof Error ? error.message : String(error)}`;
        }
      }
      return { receipts };
    });
  }
  async function scope(
    id: string,
    status: 'included' | 'excluded',
    reason: string,
    confirmReopen = false,
  ) {
    return ctx.serial('$hierarchy', async () => {
      const item = await ctx.read(id);
      if (!item.parentId) throw Error('独立工作项没有上级范围。');
      if (!['included', 'excluded'].includes(status))
        throw Error('范围状态无效。');
      if (status === 'excluded' && !reason?.trim())
        throw Error('请填写排除原因。');
      if (status === 'included' && item.status !== 'completed')
        await reopenAncestors(
          { ...item, parentScope: undefined },
          confirmReopen,
        );
      item.parentScope = {
        status,
        reason: reason?.trim(),
        at: new Date().toISOString(),
      };
      ctx.record(
        item,
        'scope',
        status === 'excluded' ? `移出范围：${reason}` : '重新纳入范围',
      );
      touch(item);
      await ctx.save(item);
      return ctx.view(item);
    });
  }
  async function reviseInput(
    id: string,
    input: {
      inputId?: string;
      source?: OutputReference;
      label?: string;
      value: Json;
      inputPort?: string;
      materialIds?: string[];
      expectedRevision?: number;
    },
  ) {
    return ctx.serial('$hierarchy', async () => {
      const item = await ctx.read(id);
      if (
        (input.inputId !== undefined || input.inputPort !== undefined) &&
        !Number.isInteger(input.expectedRevision)
      )
        throw Object.assign(Error('请提供当前工作项修订。'), {
          code: 'REVISION_REQUIRED',
        });
      if (
        input.expectedRevision !== undefined &&
        item.revision !== input.expectedRevision
      )
        throw Object.assign(Error('工作项版本已变化，请重新读取。'), {
          code: 'REVISION_CONFLICT',
        });
      if (item.status === 'completed')
        throw Error('工作项已结项，请先重新打开。');
      const previous = input.inputId
        ? item.receivedInputs?.find((i) => i.id === input.inputId)
        : undefined;
      if (input.inputId && !previous) throw Error('找不到待修订输入。');
      if (input.value === undefined) throw Error('请输入修订值。');
      const ports = input.inputPort
        ? [input.inputPort]
        : Object.entries(item.inputBindings)
            .filter(([, refs]) =>
              refs.some(
                (ref) =>
                  ref.kind === 'received' && ref.inputId === previous?.id,
              ),
            )
            .map(([port]) => port);
      if (ports.length) {
        const draftId = await files.select(item.workId, (w) => w.draftId);
        if (!draftId) throw Error('请先保存处理流程。');
        const definition = await files.readDefinition(item.workId, draftId);
        for (const port of ports) {
          if (!definition.inputs.includes(port))
            throw Error('输入入口不存在。');
          validateValue(
            definition.inputContracts?.[port]?.item as Json | undefined,
            input.value,
            '补充输入',
          );
        }
      }

      let sourceMaterials: ReceivedItemInput['materials'];
      if (input.source) {
        const { run, entry } = await readCandidateSource(files, {
          ...input.source,
          kind: 'output',
        });
        if (
          run.workItem?.id !== id &&
          !item.receivedInputs?.some((i) =>
            isDeepStrictEqual(i.source, input.source),
          )
        )
          throw Error('来源未交接给本工作项。');
        sourceMaterials = entry.materialIds.map((id) => {
          const material = run.workItem?.materials.find((m) => m.id === id);
          if (!material) throw Error(`来源原文 ${id} 不存在。`);
          return material;
        });
      }
      if (input.materialIds)
        sourceMaterials = input.materialIds.map((id) => {
          const material = item.materials.find((m) => m.id === id);
          if (!material) throw Error('材料不属于本工作项。');
          return structuredClone(material);
        });
      const received: ReceivedItemInput = {
        id: randomUUID(),
        label: input.label ?? previous?.label ?? '输入',
        value: structuredClone(input.value),
        revised: true,
        ...(previous
          ? {
              replacesId: previous.id,
              source: previous.source,
              inputSource: previous.inputSource,
              materials: sourceMaterials ?? previous.materials,
            }
          : input.source
            ? { source: input.source, materials: sourceMaterials }
            : sourceMaterials
              ? { materials: sourceMaterials }
              : {}),
      };
      item.receivedInputs = [...(item.receivedInputs ?? []), received];
      for (const selections of Object.values(item.inputBindings)) {
        for (let index = 0; index < selections.length; index++) {
          const selection = selections[index];
          if (
            (selection.kind === 'received' &&
              selection.inputId === previous?.id) ||
            (selection.kind === 'result' &&
              input.source &&
              isDeepStrictEqual(selection.source, input.source))
          )
            selections[index] = { kind: 'received', inputId: received.id };
        }
      }
      if (input.inputPort) {
        const refs = (item.inputBindings[input.inputPort] ??= []);
        if (
          !refs.some(
            (ref) => ref.kind === 'received' && ref.inputId === received.id,
          )
        )
          refs.push({ kind: 'received', inputId: received.id });
      }
      ctx.record(item, 'input', `修订输入：${received.label}`);
      touch(item);
      await ctx.save(item);
      return ctx.view(item);
    });
  }
  return {
    ancestors,
    reopenAncestors,
    candidates,
    candidatePage,
    createChildren,
    scope,
    reviseInput,
  };
}
