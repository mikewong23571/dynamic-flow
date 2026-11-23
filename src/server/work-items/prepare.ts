import type { FileStore } from '../files/index.ts';
import type {
  CriterionReference,
  ItemInputSelection,
  ItemPreparation,
  WorkItem,
  WorkItemRunSelection,
} from '../../shared/records.ts';
import { prepareItemInputs, resolveItemInputs } from './run-inputs.ts';
import { included } from './children.ts';
export function createItemPreparation(
  ctx: { read(id: string): Promise<WorkItem>; all(): Promise<WorkItem[]> },
  files: FileStore,
) {
  async function validateReference(item: WorkItem, ref: CriterionReference) {
    const work = await files.read(ref.workId),
      run = work.runs.find((r) => r.id === ref.runId),
      result = run?.results.find((r) => r.id === ref.resultId);
    if (
      !run ||
      !result ||
      run.definitionId !== ref.definitionId ||
      result.status !== 'completed'
    )
      throw Error('完成依据来源不存在或未完成。');
    if (ref.port === undefined || ref.index === undefined) {
      const values = Object.entries(result.outputs).flatMap(([port, entries]) =>
        entries.map((_, index) => ({ port, index })),
      );
      if (values.length !== 1) throw Error('请选择完成依据的具体输出项。');
      ref.port = values[0].port;
      ref.index = values[0].index;
    }
    if (
      !Number.isInteger(ref.index) ||
      ref.index < 0 ||
      !result.outputs[ref.port]?.[ref.index]
    )
      throw Error('完成依据的输出位置不存在。');
    const allowed =
      run.workItem?.id === item.id ||
      item.receivedInputs?.some(
        (i) =>
          i.source?.workId === ref.workId &&
          i.source?.runId === ref.runId &&
          i.source?.resultId === ref.resultId &&
          i.source?.port === ref.port &&
          i.source?.index === ref.index,
      );
    if (!allowed) throw Error('完成依据未交接给本工作项。');
    return { ...ref, nodeId: result.nodeId, instanceId: result.instanceId };
  }
  async function completionInputs(id: string) {
    const children = (await ctx.all()).filter((i) => i.parentId === id);
    return {
      selections: children
        .filter((i) => included(i) && i.status === 'completed')
        .map((i) => ({
          kind: 'completion' as const,
          itemId: i.id,
          completionHistoryId: i.history
            .filter((h) => h.kind === 'completed')
            .at(-1)!.id,
        })),
      uncovered: children
        .filter((i) => !included(i) || i.status !== 'completed')
        .map((i) => ({
          id: i.id,
          title: i.title,
          status: i.status,
          excluded: !included(i),
        })),
    };
  }
  async function prepare(
    id: string,
    request: Partial<WorkItemRunSelection> = {},
  ): Promise<ItemPreparation> {
    const item = await ctx.read(id);
    const response: ItemPreparation = {
      itemId: id,
      workId: item.workId,
      baseRevision: item.revision,
      inputBindings: structuredClone(
        request.inputBindings ?? item.inputBindings,
      ),
      issues: [],
    };
    try {
      const work = await files.select(item.workId, (w) => ({
        id: w.id,
        ownerItemId: w.ownerItemId,
        draftId: w.draftId,
        adoptedId: w.adoptedId,
        definitionIds: w.definitionIds,
      }));
      if (work.ownerItemId !== id) throw Error('处理空间不属于本工作项。');
      const definitionId =
        request.definitionId ?? work.draftId ?? work.adoptedId;
      if (!definitionId || !work.definitionIds.includes(definitionId))
        throw Error('请先保存本项处理流程。');
      response.definitionId = definitionId;
      const definition = await files.readDefinition(item.workId, definitionId);
      response.createsChildren = definition.nodes.some(
        (node) => node.kind === 'create-items',
      );
      const prepared = await prepareItemInputs(
        item,
        definition,
        response.inputBindings,
        files,
        { readItem: ctx.read },
      );
      response.inputs = prepared.inputs;
    } catch (error) {
      response.issues.push(
        error instanceof Error ? error.message : String(error),
      );
    }
    return response;
  }
  async function stagePreview(
    id: string,
    selection: Extract<ItemInputSelection, { kind: 'child-results' }>,
  ) {
    if (selection?.kind !== 'child-results')
      throw Error('请选择子项阶段成果。');
    const prepared = await resolveItemInputs(
      await ctx.read(id),
      { input: [selection] },
      files,
      { readItem: ctx.read },
    );
    return { value: prepared.inputs.input[0].value };
  }
  return { prepare, completionInputs, validateReference, stagePreview };
}
