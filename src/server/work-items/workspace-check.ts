import { nodeInputPorts } from '../../shared/node-ports.ts';
import { invocationBatches, invocationValue } from '../runs/invocation.ts';
import { validateValue } from '../flow/schema.ts';
import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import { parseOpenUIProgram } from '../../shared/openui.ts';
import type { Definition, Issue, WorkItem } from '../../shared/records.ts';
import type {
  ItemDelivery,
  ItemDeliveryView,
  WorkspaceCheck,
  WorkspaceCheckProposal,
} from '../../shared/workitem-composition.ts';
import type { FileStore } from '../files/index.ts';
import type { createWorkItems } from './index.ts';
import { prepareItemInputs } from './run-inputs.ts';

type Dependencies = {
  files: FileStore;
  items: ReturnType<typeof createWorkItems>;
  check: (id: string, definition: unknown) => Promise<{ issues: Issue[] }>;
  checkUiProgram: (id: string, source: string) => Promise<unknown>;
  readDelivery: (
    item: WorkItem,
    delivery: ItemDelivery,
  ) => Promise<ItemDeliveryView>;
};
/** Read real saved inputs and outputs. It never evaluates a second business graph. */
export async function checkWorkspace(
  id: string,
  proposal: WorkspaceCheckProposal,
  deps: Dependencies,
): Promise<WorkspaceCheck> {
  const { files, items } = deps,
    item = await items.get(id),
    work = await files.select(item.workId, (w) => ({
      id: w.id,
      draftId: w.draftId,
      ownerItemId: w.ownerItemId,
      runs: w.runs,
    }));
  const result: WorkspaceCheck = {
    checked: { itemRevision: item.revision },
    canExecute: false,
    canPublish: false,
    issues: [],
    unchecked: [],
    inputs: [],
    publication: { current: false, missingOutputs: [] },
  };
  const add = (
    area: WorkspaceCheck['issues'][number]['area'],
    code: string,
    path: string,
    message: string,
  ) => result.issues.push({ area, code, path, message });
  const saved = work.draftId
      ? await files.readDefinition(work.id, work.draftId)
      : undefined,
    candidate = proposal.definition ?? saved;
  const checked = await deps.check(id, candidate);
  for (const issue of checked.issues)
    add(
      'flow',
      'FLOW_INVALID',
      issue.field ?? issue.nodeId ?? 'definition',
      issue.message,
    );
  const definition = checked.issues.length
    ? undefined
    : (candidate as Definition);
  const currentDefinition =
    !!definition && isDeepStrictEqual(definition, saved);
  if (currentDefinition) result.checked.definitionId = work.draftId;
  else if (definition)
    add('flow', 'DRAFT_NOT_SAVED', 'definition', '草案尚未保存为当前版本。');
  if (definition)
    try {
      const prepared = await prepareItemInputs(
        item,
        definition,
        item.inputBindings,
        files,
        { readItem: items.get },
      );
      result.inputs = Object.entries(prepared.inputs).map(([port, values]) => ({
        port,
        count: values.length,
        types: [
          ...new Set(
            values.map((v) =>
              Array.isArray(v.value)
                ? 'array'
                : v.value === null
                  ? 'null'
                  : typeof v.value,
            ),
          ),
        ],
      }));
      for (const node of definition.nodes) {
        const edges = definition.edges.filter((edge) => edge.to[0] === node.id);
        if (!edges.length || edges.some((edge) => edge.from[0] !== '$input'))
          continue;
        const input = Object.fromEntries(
          nodeInputPorts(node).map((port) => [
            port,
            [] as (typeof prepared.inputs)[string],
          ]),
        );
        for (const edge of edges)
          input[edge.to[1]] = prepared.inputs[edge.from[1]] ?? [];
        for (const [index, batch] of invocationBatches(node, input).entries()) {
          const value = invocationValue(node, batch);
          try {
            validateValue(node.inputSchema, value, '节点实际输入');
          } catch (error) {
            add(
              'inputs',
              'NODE_INPUT_SCHEMA_MISMATCH',
              `nodes.${node.id}.input[${index}]`,
              error instanceof Error ? error.message : String(error),
            );
          }
          if (node.kind === 'function' && node.functionName === 'identity')
            try {
              validateValue(node.expectedOutput, value, '透传节点输出');
            } catch (error) {
              add(
                'inputs',
                'NODE_OUTPUT_SCHEMA_MISMATCH',
                `nodes.${node.id}.expectedOutput`,
                error instanceof Error ? error.message : String(error),
              );
            }
        }
      }
    } catch (error) {
      add(
        'inputs',
        'INPUT_BINDING_INVALID',
        'inputBindings',
        error instanceof Error ? error.message : String(error),
      );
    }
  let parsed: ReturnType<typeof parseOpenUIProgram> | undefined;
  const source = proposal.source ?? item.uiProgram?.source;
  if (source)
    try {
      parsed = parseOpenUIProgram(source);
      if (currentDefinition) {
        try {
          await deps.checkUiProgram(id, source);
        } catch (error) {
          add(
            'ui',
            'UI_CONTRACT_INVALID',
            'source',
            error instanceof Error ? error.message : String(error),
          );
        }
      }
      for (const output of parsed.outputs)
        if (definition && !(output in definition.outputs))
          add('ui', 'UI_OUTPUT_MISSING', 'source', `流程没有输出 ${output}。`);
    } catch (error) {
      add(
        'ui',
        'UI_PROGRAM_INVALID',
        'source',
        error instanceof Error ? error.message : String(error),
      );
    }
  else add('ui', 'UI_PROGRAM_MISSING', 'source', '尚未保存OpenUI界面。');
  const currentProgram =
    !!item.uiProgram &&
    source === item.uiProgram.source &&
    item.uiProgram.definitionId === work.draftId;
  if (currentProgram) result.checked.programId = item.uiProgram!.id;
  else if (parsed)
    add('ui', 'UI_PROGRAM_NOT_SAVED', 'source', '界面尚未保存到当前定义。');
  const runId = proposal.runId;
  result.checked.runId = runId;
  const run = runId ? work.runs.find((r) => r.id === runId) : undefined;
  if (!runId)
    result.unchecked.push({
      area: 'run',
      code: 'OUTPUTS_UNVERIFIED',
      path: 'runId',
      message: '未指定真实运行，输出及发布条件尚未验证。',
    });
  else if (
    !run ||
    run.workItem?.id !== id ||
    run.effectMode !== 'commit' ||
    run.scope !== 'full' ||
    run.comparisonId
  )
    add(
      'run',
      'DELIVERY_SOURCE_INVALID',
      'runId',
      '请选择本工作项的正式完整运行。',
    );
  else if (run.status !== 'completed')
    add('run', 'RUN_NOT_COMPLETED', 'run.status', `运行当前为 ${run.status}。`);
  else if (run.definitionId !== work.draftId)
    add(
      'run',
      'RUN_DEFINITION_MISMATCH',
      'run.definitionId',
      '运行不是当前定义的固定版本。',
    );
  else if (parsed && item.uiProgram)
    for (const output of parsed.outputs)
      try {
        const view = parsed.records.find((r) => r.output === output);
        const data = await deps.readDelivery(item, {
          id: randomUUID(),
          createdAt: run.finishedAt ?? run.startedAt,
          workId: work.id,
          runId: run.id,
          definitionId: run.definitionId,
          output,
          uiProgramId: item.uiProgram.id,
          ...(view ? { recordContract: { rowKey: view.rowKey } } : {}),
        });
        if (view) {
          const ids = new Set<string>();
          for (const row of data.rows ?? []) {
            if (!row || typeof row !== 'object' || Array.isArray(row))
              throw Error('记录不是对象。');
            const key = row[view.rowKey];
            if (typeof key !== 'string' || !key.trim() || ids.has(key))
              throw Error('记录编号缺失或重复。');
            ids.add(key);
            for (const field of [...view.columns, ...(view.details ?? [])])
              if (!(field.field in row))
                throw Error(`成果缺少字段 ${field.field}。`);
          }
        }
      } catch (error) {
        add(
          'ui',
          'VIEW_DATA_INVALID',
          `output.${output}`,
          error instanceof Error ? error.message : String(error),
        );
      }
  if (item.status === 'completed')
    add(
      'state',
      'ITEM_COMPLETED',
      'item.status',
      '工作项已结项，需要明确重开。',
    );
  if (
    item.execution &&
    ['queued', 'running', 'waiting', 'stopping', 'interrupted'].includes(
      item.execution.status,
    )
  )
    add('state', 'EXECUTION_PENDING', 'item.execution', '已有执行尚待处理。');
  const latest = await items.get(id),
    latestDraft = await files.select(work.id, (w) => w.draftId);
  if (latest.revision !== item.revision || latestDraft !== work.draftId)
    add('state', 'CHECK_STALE', 'checked', '检查期间方案或输入已变化。');
  result.unchecked.push({
    area: 'state',
    code: 'BUSINESS_ACCEPTANCE_UNVERIFIED',
    path: 'item.criteria',
    message: '机械检查不确认业务事实、完成条件或结项。',
  });
  result.canExecute =
    currentDefinition &&
    !result.issues.some((i) => ['flow', 'inputs', 'state'].includes(i.area));
  result.canPublish =
    !!run &&
    run.status === 'completed' &&
    currentDefinition &&
    currentProgram &&
    !!parsed?.outputs.length &&
    !result.issues.some((i) => ['flow', 'ui', 'run', 'state'].includes(i.area));
  result.publication.missingOutputs = (parsed?.outputs ?? []).filter(
    (output) =>
      !item.deliveries.some(
        (d) =>
          d.uiProgramId === item.uiProgram?.id &&
          d.runId === runId &&
          d.output === output,
      ),
  );
  result.publication.current =
    result.canPublish && result.publication.missingOutputs.length === 0;
  return result;
}
