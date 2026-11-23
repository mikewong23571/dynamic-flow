import { isDeepStrictEqual } from 'node:util';
import type {
  ContentMaterial,
  Definition,
  Inputs,
  ItemInputSelection,
  ItemRunRef,
  OutputReference,
  StartRun,
  WorkItemInput,
  WorkItemRunSelection,
} from '../../shared/records.ts';
import { nodeInputPorts } from '../../shared/node-ports.ts';
import { materializeDefinition } from '../../shared/expansion.ts';
import type { FileStore } from '../files/index.ts';
import { checkDefinition, type FlowService } from '../flow/index.ts';
import type { RunService } from '../runs/index.ts';
import type { createWorkItems } from './index.ts';
import { prepareItemInputs } from './run-inputs.ts';
const failure = (code: string, message: string) =>
  Object.assign(Error(message), { code });

/** Formal user, assistant and batch requests share this exact preparation and launch. */
export function createItemExecution(
  files: FileStore,
  flow: FlowService,
  items: ReturnType<typeof createWorkItems>,
  runs: RunService,
) {
  async function startPrepared(
    input: WorkItemInput,
    workId: string,
    definitionId: string,
    definition: Definition,
    bindings: Record<string, ItemInputSelection[]>,
    retrySource?: StartRun['retrySource'],
  ): Promise<ItemRunRef> {
    const prepared = await prepareItemInputs(
      input,
      definition,
      bindings,
      files,
      { readItem: items.get },
    );
    const runId = await runs.start(workId, {
      definitionId,
      scope: 'full',
      inputs: prepared.inputs,
      materials: prepared.workItem.materials,
      inputSources: prepared.inputSources,
      workItem: prepared.workItem,
      effectMode: 'commit',
      retrySource,
    });
    return { workId, runId, definitionId };
  }
  async function runItem(
    id: string,
    request: Partial<WorkItemRunSelection> = {},
  ) {
    if (!Number.isInteger(request.baseRevision))
      throw failure('REVISION_REQUIRED', '请提供当前工作项修订。');
    return items.launch(
      id,
      async (input, workId, item) => {
        const work = await files.select(workId, (w) => ({
          ownerItemId: w.ownerItemId,
          draftId: w.draftId,
          definitionIds: w.definitionIds,
        }));
        if (work.ownerItemId !== id)
          throw failure('WORKSPACE_OWNER_MISMATCH', '处理空间归属不一致。');
        const definitionId = request.definitionId ?? work.draftId;
        if (!definitionId || !work.definitionIds.includes(definitionId))
          throw failure('DEFINITION_MISSING', '请选择本项已保存的版本。');
        if (
          request.inputBindings &&
          !isDeepStrictEqual(request.inputBindings, item.inputBindings)
        )
          throw failure(
            'INPUT_BINDING_CONFLICT',
            '本次输入与已保存绑定不同，请重新准备。',
          );
        const definition = await files.readDefinition(workId, definitionId);
        if (request.scope && request.scope !== 'full')
          throw failure(
            'SCOPE_INVALID',
            '单步骤正式处理请先将该步骤保存为本项流程片段。',
          );
        return startPrepared(
          input,
          workId,
          definitionId,
          definition,
          item.inputBindings,
        );
      },
      request.baseRevision!,
    );
  }
  async function continueFailedInputs(
    id: string,
    request: {
      baseRevision: number;
      runId: string;
      resultIds: string[];
      workId?: string;
    },
  ) {
    if (!Number.isInteger(request.baseRevision))
      throw failure('REVISION_REQUIRED', '请提供当前工作项修订。');
    const item = await items.get(id),
      sourceWorkId = request.workId ?? item.workId;
    const old = await files.select(sourceWorkId, (w) =>
      w.runs.find((r) => r.id === request.runId),
    );
    if (
      !old ||
      old.workItem?.id !== id ||
      old.effectMode !== 'commit' ||
      old.status !== 'failed'
    )
      throw failure('RUN_SOURCE_INVALID', '请选择本项已经失败的正式运行。');
    if (!Array.isArray(request.resultIds))
      throw failure('FAILED_INPUTS_INVALID', '请明确选择失败实例。');
    const selected = old.results.filter((r) =>
      request.resultIds.includes(r.id),
    );
    if (
      !selected.length ||
      selected.length !== new Set(request.resultIds).size ||
      selected.some((r) => r.status !== 'failed') ||
      new Set(selected.map((r) => r.nodeId)).size !== 1
    )
      throw failure('FAILED_INPUTS_INVALID', '请明确选择同一步骤的失败实例。');
    const original = materializeDefinition(
        await files.readDefinition(sourceWorkId, old.definitionId),
        old.expansions ?? [],
      ),
      node = original.nodes.find((n) => n.id === selected[0].nodeId);
    if (!node || !['agent', 'function'].includes(node.kind))
      throw failure(
        'FAILED_NODE_INVALID',
        '请选择失败的普通Agent或Function实例。',
      );
    const ports = nodeInputPorts(node),
      fragment: Definition = {
        sourceNode: {
          workId: sourceWorkId,
          definitionId: old.definitionId,
          nodeId: node.id,
        },
        schemaVersion: 1,
        inputs: ports,
        nodes: [structuredClone(node)],
        edges: ports.map((port) => ({
          from: ['$input', port],
          to: [node.id, port],
        })),
        outputs: { output: [node.id, 'output'] },
      };
    const issues = checkDefinition(fragment);
    if (issues.length)
      throw failure(
        'FAILED_NODE_INVALID',
        issues.map((i) => i.message).join('；'),
      );
    return items.launch(
      id,
      async (input, workId) => {
        // Build frozen retry inputs directly from the failed instances without mutating
        // the work item's primary flow draft, inputBindings, or receivedInputs.
        const inputs: Inputs = {};
        const materialsMap = new Map<string, ContentMaterial>();
        const inputSources: OutputReference[] = [];
        for (const port of ports) {
          inputs[port] = [];
          for (const result of selected) {
            for (const [index, value] of (result.input[port] ?? []).entries()) {
              const inputSource: OutputReference = {
                workId: sourceWorkId,
                runId: old.id,
                resultId: result.id,
                port,
                index,
              };
              for (const mid of value.materialIds) {
                if (materialsMap.has(mid)) continue;
                const material = old.materials.find((m) => m.id === mid);
                if (!material)
                  throw failure(
                    'SOURCE_MATERIAL_MISSING',
                    '失败输入的固定材料缺失。',
                  );
                materialsMap.set(mid, structuredClone(material));
              }
              inputs[port].push({
                sampleId: value.sampleId,
                value: structuredClone(value.value),
                materialIds: [...value.materialIds],
                sourceResultIds: [...value.sourceResultIds],
                ...(value.source
                  ? { source: structuredClone(value.source) }
                  : {}),
                inputSource,
              });
              inputSources.push(inputSource);
            }
          }
        }
        const materials = [...materialsMap.values()];
        // Save the retry fragment as an immutable definition without clobbering work.draftId.
        const definitionId = await files.writeDefinition(workId, fragment);
        await files.change(workId, (w) => {
          if (!w.definitionIds.includes(definitionId))
            w.definitionIds.push(definitionId);
        });
        const runId = await runs.start(workId, {
          definitionId,
          scope: 'full',
          inputs,
          materials,
          inputSources,
          workItem: { ...input, materials },
          effectMode: 'commit',
          retrySource: {
            workId: sourceWorkId,
            runId: old.id,
            definitionId: old.definitionId,
            resultIds: [...request.resultIds],
          },
        });
        return { workId, runId, definitionId };
      },
      request.baseRevision,
    );
  }
  return { runItem, continueFailedInputs };
}
