import { createHash, randomUUID } from 'node:crypto';
import { exceedsInlineBudget } from '../flow/overview.ts';
import {
  stageSourceScope,
  withinStageScope,
  type StageSourceScope,
} from './source-scope.ts';
import type { createBatchRuns } from './batch-runs.ts';
import { extractUploadText } from './upload-text.ts';
import { prepareItemInputs, resolveItemInputs } from './run-inputs.ts';
import {
  mergeOpenUIProgram,
  parseOpenUIProgram,
  type OpenUIProgram,
  type OpenUIRecordView,
} from '../../shared/openui.ts';
import {
  expandedCollectionOutput,
  nodeInputPorts,
  nodeOutputPorts,
} from '../../shared/node-ports.ts';
import type {
  Definition,
  FlowNode,
  Json,
  OutputReference,
  WorkItem,
  ItemInputSelection,
} from '../../shared/records.ts';
import type {
  ItemDelivery,
  ItemDeliveryView,
  ItemWorkspace,
  MethodCapability,
  WorkspaceCheckProposal,
} from '../../shared/workitem-composition.ts';
import type { FileStore } from '../files/index.ts';
import type { FlowService } from '../flow/index.ts';
import { validateCallReferences } from '../flow/calls.ts';
import { checkDefinition } from '../flow/index.ts';
import { validateValue } from '../flow/schema.ts';
import type { createWorkItems } from './index.ts';
import type { createWorkService } from '../work/index.ts';
import { checkWorkspace } from './workspace-check.ts';

type Items = ReturnType<typeof createWorkItems>;
const fail = (code: string, message: string) =>
  Object.assign(Error(message), { code });
function portItemContract(
  node: FlowNode | undefined,
  port: string,
): Json | null {
  if (
    !node ||
    node.expectedOutput === undefined ||
    (node.kind === 'wait' && port === 'event')
  )
    return null;
  const schema = node.expectedOutput;
  if (node.kind === 'call') {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema))
      return null;
    const props = schema.properties;
    if (!props || typeof props !== 'object' || Array.isArray(props))
      return null;
    const output = props[port];
    return output && typeof output === 'object' && !Array.isArray(output)
      ? (output.items ?? null)
      : null;
  }
  if (
    expandedCollectionOutput(node) ||
    node.operation === 'flatMap' ||
    ['wait', 'milestone', 'branch', 'create-items'].includes(node.kind)
  )
    return schema && typeof schema === 'object' && !Array.isArray(schema)
      ? (schema.items ?? null)
      : null;
  return schema;
}

/** One business workspace: native OpenUI, fixed deliveries and a single input binding. */
export function createItemComposition(
  files: FileStore,
  flow: FlowService,
  items: Items,
  works: ReturnType<typeof createWorkService>,
  readBatches?: () => ReturnType<typeof createBatchRuns>,
) {
  async function privateWork(item: WorkItem) {
    const work = await files.read(item.workId);
    if (work.ownerItemId !== item.id)
      throw fail('WORKSPACE_OWNER_MISMATCH', '工作项流程归属不一致。');
    return work;
  }
  async function methodHeaders() {
    return (
      await files.list((w) => ({
        id: w.id,
        title: w.title,
        goal: w.goal,
        ownerItemId: w.ownerItemId,
        archivedAt: w.archivedAt,
        definitionIds: w.definitionIds,
        adoptedId: w.adoptedId,
        uiProgramTemplate: w.uiProgramTemplate,
      }))
    )
      .filter((w) => !w.ownerItemId && !w.archivedAt)
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  async function version(id: string) {
    return createHash('sha256')
      .update(await items.version(id, true))
      .update(JSON.stringify(await methodHeaders()))
      .digest('hex');
  }
  async function methods(query = '') {
    const result: MethodCapability[] = [];
    for (const w of (await methodHeaders()).filter(
      (w) =>
        !query ||
        `${w.title} ${w.goal}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
    )) {
      for (const definitionId of w.definitionIds) {
        const d = await files.readDefinition(w.id, definitionId);
        result.push({
          workId: w.id,
          title: w.title || w.goal,
          goal: w.goal,
          definitionId,
          inputs: d.inputs,
          outputs: Object.keys(d.outputs),
          inputContracts: d.inputContracts,
          adopted: w.adoptedId === definitionId,
          definition: d,
          ...(w.uiProgramTemplate?.definitionId === definitionId
            ? { uiProgramTemplate: w.uiProgramTemplate }
            : {}),
          outputContracts: Object.fromEntries(
            Object.entries(d.outputs).map(([port, [nodeId, sourcePort]]) => [
              port,
              portItemContract(
                d.nodes.find((n) => n.id === nodeId),
                sourcePort,
              ),
            ]),
          ),
          effects: d.nodes
            .filter((n) =>
              ['milestone', 'create-items', 'wait'].includes(n.kind),
            )
            .map((n) => ({ kind: n.kind, label: n.label })),
        });
      }
    }
    return result;
  }
  async function readDelivery(
    item: WorkItem,
    delivery: ItemDelivery,
    columnsOnly = false,
    recordId?: string,
  ): Promise<ItemDeliveryView> {
    const d = await files.readDefinition(
        delivery.workId,
        delivery.definitionId,
      ),
      target = d.outputs[delivery.output];
    if (!target) throw fail('DELIVERY_OUTPUT_MISSING', '指定交付输出不存在。');
    const entries = await files.select(delivery.workId, (work) => {
      const run = work.runs.find((r) => r.id === delivery.runId);
      if (
        !run ||
        run.workItem?.id !== item.id ||
        run.definitionId !== delivery.definitionId
      )
        throw fail('DELIVERY_SOURCE_INVALID', '交付来源不属于本工作项。');
      return run.results
        .filter(
          (r) =>
            r.nodeId === target[0] &&
            r.status === 'completed' &&
            !r.purpose &&
            !r.intermediate,
        )
        .flatMap((r) =>
          (r.outputs[target[1]] ?? []).map((entry, index) => ({
            value: entry.value,
            source: {
              workId: work.id,
              runId: run.id,
              resultId: r.id,
              port: target[1],
              index,
            } satisfies OutputReference,
          })),
        );
    });
    const rows: Json[] = [],
      sources: OutputReference[] = [];
    for (const entry of entries)
      for (const value of Array.isArray(entry.value)
        ? entry.value
        : [entry.value]) {
        if (
          recordId !== undefined &&
          (!value ||
            typeof value !== 'object' ||
            Array.isArray(value) ||
            value[delivery.recordContract!.rowKey] !== recordId)
        )
          continue;
        rows.push(value);
        sources.push(entry.source);
      }
    // Data is read once. Detailed records remain available by their frozen business ID.
    const large =
      !!delivery.recordContract && columnsOnly && exceedsInlineBudget(rows);
    let projected = rows;
    if (large) {
      const program =
        item.uiProgram?.id === delivery.uiProgramId
          ? item.uiProgram
          : item.history
              .map((h) => h.uiSnapshot?.program)
              .find((p) => p?.id === delivery.uiProgramId);
      const view = program
        ? parseOpenUIProgram(program.source).records.find(
            (r) => r.output === delivery.output,
          )
        : undefined;
      const fields = new Set([
        delivery.recordContract!.rowKey,
        ...(view?.columns.map((c) => c.field) ?? []),
        ...(view?.groupBy ? [view.groupBy] : []),
      ]);
      projected = rows.map((row) =>
        row && typeof row === 'object' && !Array.isArray(row)
          ? Object.fromEntries(
              [...fields].filter((f) => f in row).map((f) => [f, row[f]]),
            )
          : row,
      );
    }
    return {
      ...delivery,
      rows: projected,
      recordsOmitted: large,
      value: delivery.recordContract
        ? undefined
        : rows.length === 1
          ? rows[0]
          : rows,
      sources,
    };
  }
  async function snapshot(id: string): Promise<ItemWorkspace> {
    const item = await items.get(id),
      work = await flow.snapshot(item.workId, { overview: true });
    if (work.work.ownerItemId !== item.id)
      throw fail('WORKSPACE_OWNER_MISMATCH', '工作项流程归属不一致。');
    const deliveries = await Promise.all(
      item.deliveries.map(async (d) => {
        try {
          return await readDelivery(item, d, true);
        } catch (e) {
          return {
            ...d,
            sources: [],
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }),
    );
    return {
      item: {
        ...item,
        materials: item.materials.map((m) =>
          exceedsInlineBudget(m.text)
            ? {
                ...m,
                text: m.text.slice(0, 256),
                characters: m.text.length,
                contentUrl: `/api/items/${id}/content?materialId=${encodeURIComponent(m.id)}`,
              }
            : m,
        ),
        receivedInputs: item.receivedInputs?.map((input) => ({
          ...input,
          ...(exceedsInlineBudget(input.value)
            ? {
                value: null,
                contentUrl: `/api/items/${id}/content?inputId=${encodeURIComponent(input.id)}`,
              }
            : {}),
        })),
      },
      work,
      methods: await methods(),
      uiProgram: item.uiProgram,
      uploads: await files.listUploads(work.work.id),
      deliveries,
    };
  }
  /** Read the same explicitly bound values that the next execution will consume. */
  async function readInputs(
    id: string,
    inputPort: string,
    offset = 0,
    limit = 25,
  ) {
    const item = await items.get(id);
    const work = await files.select(item.workId, (work) => ({
      ownerItemId: work.ownerItemId,
      draftId: work.draftId,
      adoptedId: work.adoptedId,
    }));
    if (work.ownerItemId !== item.id)
      throw fail('WORKSPACE_OWNER_MISMATCH', '工作项流程归属不一致。');
    const definitionId = work.draftId ?? work.adoptedId;
    if (!definitionId) throw fail('FLOW_EMPTY', '尚未保存本项处理定义。');
    const definition = await files.readDefinition(item.workId, definitionId);
    if (!definition.inputs.includes(inputPort))
      throw fail('INPUT_PORT_MISSING', '指定输入入口不存在。');
    const resolved = await resolveItemInputs(
      item,
      { [inputPort]: item.inputBindings[inputPort] ?? [] },
      files,
      { readItem: items.get },
    );
    const inputs = resolved.inputs[inputPort];
    const start = Math.max(0, Math.trunc(offset));
    const size = Math.max(1, Math.min(50, Math.trunc(limit)));
    const page = inputs.slice(start, start + size);
    return {
      definitionId,
      revision: item.revision,
      rows: page.map((entry) => entry.value),
      sources: page.map((entry) => entry.source ?? null),
      total: inputs.length,
      offset: start,
      limit: size,
    };
  }

  /** Observe actual stage output. It is deliberately independent of publishing. */
  async function readOutput(
    id: string,
    options: {
      output?: string;
      nodeId?: string;
      port?: string;
      runId?: string;
      offset?: number;
      limit?: number;
    },
  ) {
    const item = await items.get(id);
    const runId = options.runId ?? item.execution?.runId;
    const offset = Math.max(0, Math.trunc(options.offset ?? 0));
    const limit = Math.max(1, Math.min(50, Math.trunc(options.limit ?? 25)));
    if (!runId)
      return { run: null, rows: [], sources: [], total: 0, offset, limit };
    const run = await files.select(item.workId, (work) => {
      const found = work.runs.find((entry) => entry.id === runId);
      if (!found || found.workItem?.id !== id)
        throw fail('RUN_NOT_FOUND', '指定执行不属于本工作项。');
      return {
        id: found.id,
        definitionId: found.definitionId,
        status: found.status,
        effectMode: found.effectMode,
      };
    });
    const definition = await files.readDefinition(
      item.workId,
      run.definitionId,
    );
    if (
      options.output !== undefined &&
      (options.nodeId !== undefined || options.port !== undefined)
    )
      throw fail(
        'OUTPUT_REFERENCE_INVALID',
        '请选择具名输出或明确步骤端口，不能同时指定。',
      );
    const target =
      options.output !== undefined
        ? definition.outputs[options.output]
        : options.nodeId && options.port
          ? [options.nodeId, options.port]
          : undefined;
    const node = definition.nodes.find((node) => node.id === target?.[0]);
    if (!target || !node || !nodeOutputPorts(node).includes(target[1]))
      throw fail('OUTPUT_NOT_FOUND', '指定阶段输出不存在。');
    return files.select(item.workId, (work) => {
      const actual = work.runs.find((entry) => entry.id === runId);
      if (!actual) throw fail('RUN_NOT_FOUND', '指定执行不存在。');
      const entries = actual.results
        .filter(
          (result) =>
            result.nodeId === target[0] &&
            result.status === 'completed' &&
            !result.purpose &&
            !result.intermediate,
        )
        .flatMap((result) =>
          (result.outputs[target[1]] ?? []).flatMap((entry, index) =>
            (Array.isArray(entry.value) ? entry.value : [entry.value]).map(
              (value) => ({
                value,
                source: {
                  workId: item.workId,
                  runId,
                  resultId: result.id,
                  port: target[1],
                  index,
                } satisfies OutputReference,
              }),
            ),
          ),
        );
      const page = entries.slice(offset, offset + limit);
      return {
        run: {
          id: actual.id,
          definitionId: actual.definitionId,
          status: actual.status,
          effectMode: actual.effectMode,
        },
        rows: page.map((entry) => entry.value),
        sources: page.map((entry) => entry.source),
        total: entries.length,
        offset,
        limit,
      };
    });
  }
  async function check(id: string, proposal: unknown) {
    const item = await items.get(id),
      definition = proposal as Definition,
      issues = checkDefinition(definition);
    if (!issues.length) {
      const uploads = new Set(await files.listUploads(item.workId));
      for (const node of definition.nodes)
        if (node.kind === 'file' && !uploads.has(node.file!.name))
          issues.push({
            nodeId: node.id,
            field: 'file.name',
            message: `文件 ${node.file!.name} 不存在于本项上传目录。业务输入应使用 $input 和已声明端口，file 仅引用实际上传文件。`,
          });
    }
    if (!issues.length)
      try {
        await validateCallReferences(
          files,
          item.workId,
          'proposal',
          definition,
          id,
        );
      } catch (e) {
        issues.push({
          field: 'call',
          message: e instanceof Error ? e.message : String(e),
        });
      }
    return { issues };
  }
  async function saveFlow(
    id: string,
    baseRevision: number,
    definition: Definition,
    expectedDraftId?: string,
  ) {
    const checked = await check(id, definition);
    if (checked.issues.length)
      throw Object.assign(
        fail('FLOW_INVALID', '流程尚有需要修正的问题。'),
        checked,
      );
    await items.compositionChange(id, baseRevision, async (item) => {
      const w = await privateWork(item);
      await flow.saveDraft(w.id, expectedDraftId, definition);
      item.inputBindings = Object.fromEntries(
        Object.entries(item.inputBindings).filter(([port]) =>
          definition.inputs.includes(port),
        ),
      );
    });
    return snapshot(id);
  }
  async function checkUiProgram(
    id: string,
    source: string,
    definitionId?: string,
  ) {
    const item = await items.get(id),
      w = await privateWork(item),
      fixedId = definitionId ?? w.draftId;
    if (!fixedId || !w.definitionIds.includes(fixedId))
      throw fail('FLOW_EMPTY', '请先保存处理流程。');
    const definition = await files.readDefinition(w.id, fixedId),
      parsed = parseOpenUIProgram(source);
    for (const output of parsed.outputs)
      if (!(output in definition.outputs))
        throw fail('UI_OUTPUT_MISSING', `流程没有输出 ${output}。`);
    for (const form of parsed.inputs) {
      let target = definition;
      if (form.methodId || form.methodDefinitionId) {
        if (!form.methodId || !form.methodDefinitionId)
          throw fail('UI_METHOD_INVALID', '输入表单需要明确方法与版本。');
        const header = await files.select(form.methodId, (w) => ({
          ownerItemId: w.ownerItemId,
          definitionIds: w.definitionIds,
        }));
        if (
          header.ownerItemId ||
          !header.definitionIds.includes(form.methodDefinitionId)
        )
          throw fail('UI_METHOD_INVALID', '输入表单的方法版本不可用。');
        target = await files.readDefinition(
          form.methodId,
          form.methodDefinitionId,
        );
      }
      if (!target.inputs.includes(form.inputPort))
        throw fail(
          'UI_INPUT_PORT_MISSING',
          `表单输入入口 ${form.inputPort} 不存在。`,
        );
      const contract = target.inputContracts?.[form.inputPort]?.item;
      const properties =
        contract && typeof contract === 'object' && !Array.isArray(contract)
          ? contract.properties
          : undefined;
      if (
        form.fields?.some(
          (field) =>
            !properties ||
            typeof properties !== 'object' ||
            !(field in properties),
        )
      )
        throw fail('UI_INPUT_FIELD_MISSING', '表单字段不属于实际输入合同。');
    }
    return { parsed, definitionId: fixedId };
  }
  async function saveUiProgram(
    id: string,
    baseRevision: number,
    request: {
      source?: string;
      patch?: string;
      expectedProgramId?: string;
      definitionId?: string;
    },
  ) {
    await items.compositionChange(id, baseRevision, async (item) => {
      if (item.uiProgram?.id !== request.expectedProgramId)
        throw fail('UI_PROGRAM_CONFLICT', '界面已变化，请重新读取。');
      const source =
        request.patch !== undefined
          ? mergeOpenUIProgram(item.uiProgram?.source ?? '', request.patch)
          : request.source;
      if (source === undefined)
        throw fail('UI_PROGRAM_INVALID', '请提供完整程序或具名补丁。');
      const { parsed, definitionId } = await checkUiProgram(
        id,
        source,
        request.definitionId,
      );
      const next: OpenUIProgram = { id: randomUUID(), definitionId, source };
      // Revalidate every current fixed output before changing a published presentation.
      const rebound: ItemDelivery[] = [];
      for (const old of item.deliveries) {
        if (
          old.definitionId !== definitionId ||
          !parsed.outputs.includes(old.output)
        ) {
          rebound.push(old);
          continue;
        }
        const view = parsed.records.find((r) => r.output === old.output);
        const changedIdentity = old.recordContract?.rowKey !== view?.rowKey;
        const replacement = {
          ...old,
          id: changedIdentity ? randomUUID() : old.id,
          uiProgramId: next.id,
          ...(view
            ? { recordContract: { rowKey: view.rowKey } }
            : { recordContract: undefined }),
        };
        validateRows(await readDelivery(item, replacement), view);
        rebound.push(replacement);
      }
      if (item.uiProgram)
        item.history.push({
          id: randomUUID(),
          at: new Date().toISOString(),
          kind: 'interface',
          summary: '修改界面安排',
          uiSnapshot: {
            program: structuredClone(item.uiProgram),
            deliveries: structuredClone(item.deliveries),
          },
        });
      item.uiProgram = next;
      item.deliveries = rebound;
    });
    return snapshot(id);
  }
  function validateRows(data: ItemDeliveryView, view?: OpenUIRecordView) {
    if (!view) return;
    const ids = new Set<string>();
    for (const row of data.rows ?? []) {
      if (!row || typeof row !== 'object' || Array.isArray(row))
        throw fail('VIEW_INVALID', '记录集合需要对象。');
      const key = row[view.rowKey];
      if (typeof key !== 'string' || !key.trim() || ids.has(key))
        throw fail('VIEW_RECORD_ID_INVALID', '记录编号缺失或重复。');
      ids.add(key);
      for (const field of [...view.columns, ...(view.details ?? [])])
        if (!(field.field in row))
          throw fail('VIEW_FIELD_MISSING', `成果缺少字段 ${field.field}。`);
      if (view.groupBy && !(view.groupBy in row))
        throw fail('VIEW_FIELD_MISSING', `成果缺少字段 ${view.groupBy}。`);
    }
  }
  async function publishDelivery(
    id: string,
    baseRevision: number,
    runId: string,
    output: string,
    programId: string,
  ) {
    await items.compositionChange(id, baseRevision, async (item) => {
      const w = await privateWork(item),
        run = w.runs.find((r) => r.id === runId),
        program = item.uiProgram;
      if (!program || program.id !== programId)
        throw fail('UI_PROGRAM_STALE', '请选择当前已保存界面。');
      if (
        !run ||
        run.workItem?.id !== id ||
        run.status !== 'completed' ||
        run.effectMode !== 'commit' ||
        run.scope !== 'full' ||
        run.comparisonId ||
        !item.runs.some((r) => r.runId === runId && r.workId === w.id)
      )
        throw fail('DELIVERY_SOURCE_INVALID', '请选择本项成功完成的正式运行。');
      if (program.definitionId !== run.definitionId)
        throw fail('UI_PROGRAM_STALE', '界面与运行固定版本不同。');
      const parsed = parseOpenUIProgram(program.source),
        view = parsed.records.find((v) => v.output === output);
      if (!parsed.outputs.includes(output))
        throw fail('DELIVERY_OUTPUT_MISSING', '当前程序没有声明该输出。');
      const delivery: ItemDelivery = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        workId: w.id,
        runId,
        definitionId: run.definitionId,
        output,
        uiProgramId: program.id,
        ...(view ? { recordContract: { rowKey: view.rowKey } } : {}),
      };
      validateRows(await readDelivery(item, delivery), view);
      item.deliveries = [
        ...item.deliveries.filter((d) => d.output !== output),
        delivery,
      ];
    });
    return snapshot(id);
  }
  async function prepareMethod(
    methodId: string,
    definitionId: string,
    scope?: { nodeId: string },
  ) {
    const method = await files.select(methodId, (w) => ({
      ownerItemId: w.ownerItemId,
      definitionIds: w.definitionIds,
      uiProgramTemplate: w.uiProgramTemplate,
    }));
    if (method.ownerItemId || !method.definitionIds.includes(definitionId))
      throw fail('METHOD_INVALID', '请选择公共目录中的固定方法版本。');
    const d = await files.readDefinition(methodId, definitionId);
    let definition: Definition;
    if (scope) {
      const node = d.nodes.find((n) => n.id === scope.nodeId);
      if (!node || !['agent', 'function'].includes(node.kind))
        throw fail('NODE_INVALID', '单步骤正式处理请选择普通Agent或Function。');
      const ports = nodeInputPorts(node);
      definition = {
        schemaVersion: 1,
        sourceNode: { workId: methodId, definitionId, nodeId: node.id },
        inputs: ports,
        nodes: [structuredClone(node)],
        edges: ports.map((port) => ({
          from: ['$input', port],
          to: [node.id, port],
        })),
        outputs: { output: [node.id, 'output'] },
      };
    } else
      definition = {
        schemaVersion: 1,
        inputs: d.inputs,
        inputContracts: d.inputContracts,
        nodes: [
          {
            id: 'apply',
            label: '应用处理方法',
            kind: 'call',
            operation: 'aggregate',
            call: {
              workId: methodId,
              definitionId,
              inputNames: d.inputs,
              outputNames: Object.keys(d.outputs),
            },
          },
        ],
        edges: d.inputs.map((port) => ({
          from: ['$input', port],
          to: ['apply', port],
        })),
        outputs: Object.fromEntries(
          Object.keys(d.outputs).map((output) => [output, ['apply', output]]),
        ),
      };
    return {
      definition,
      template:
        !scope && method.uiProgramTemplate?.definitionId === definitionId
          ? method.uiProgramTemplate
          : undefined,
    };
  }
  function noteMethod(item: WorkItem) {
    const at = new Date().toISOString();
    item.history.push({
      id: randomUUID(),
      at,
      kind: 'method',
      summary: '采用明确的处理方法版本',
    });
    item.progressAt = at;
    delete item.nextAction;
    delete item.blocker;
  }
  async function useMethod(
    id: string,
    baseRevision: number,
    methodId: string,
    definitionId: string,
    scope?: { nodeId: string },
    inputBindings?: Record<string, ItemInputSelection[]>,
  ) {
    const prepared = await prepareMethod(methodId, definitionId, scope);
    await items.compositionChange(id, baseRevision, async (item) => {
      await items.assertIdle(id);
      if (inputBindings)
        await prepareItemInputs(
          item,
          prepared.definition,
          inputBindings,
          files,
          { readItem: items.get },
        );
      const w = await privateWork(item),
        saved = await flow.saveDraft(w.id, w.draftId, prepared.definition);
      item.inputBindings = structuredClone(inputBindings ?? {});
      noteMethod(item);
      if (prepared.template)
        item.uiProgram = {
          ...structuredClone(prepared.template),
          id: randomUUID(),
          definitionId: saved,
        };
    });
    return snapshot(id);
  }
  async function continueRecords(
    id: string,
    baseRevision: number,
    deliveryId: string,
    recordIds: string[],
    inputPort?: string,
    methodId?: string,
    methodDefinitionId?: string,
    patch?: { draft: Record<string, Json>; recordField?: string },
  ) {
    if (methodId && !methodDefinitionId)
      throw fail('METHOD_VERSION_MISSING', '请选择固定方法版本。');
    const preparedMethod = methodId
      ? await prepareMethod(methodId, methodDefinitionId!)
      : undefined;
    await items.compositionChange(id, baseRevision, async (item) => {
      if (preparedMethod) await items.assertIdle(id);
      const fixed = item.deliveries.find((d) => d.id === deliveryId);
      if (!fixed?.recordContract)
        throw fail('DELIVERY_STALE', '请选择有固定记录编号的交付。');
      if (
        !Array.isArray(recordIds) ||
        !recordIds.length ||
        new Set(recordIds).size !== recordIds.length
      )
        throw fail('RECORD_SELECTION_INVALID', '请选择不重复的记录。');
      const data = await readDelivery(item, fixed),
        key = fixed.recordContract.rowKey,
        w = await privateWork(item);
      if (!w.draftId) throw fail('FLOW_EMPTY', '请先保存处理流程。');
      const d =
          preparedMethod?.definition ??
          (await files.readDefinition(w.id, w.draftId)),
        port = inputPort ?? (d.inputs.length === 1 ? d.inputs[0] : undefined);
      if (!port || !d.inputs.includes(port))
        throw fail('INPUT_PORT_MISSING', '请选择明确输入入口。');
      const selections: ItemInputSelection[] = [];
      for (const recordId of recordIds) {
        const index = data.rows!.findIndex(
          (row) =>
            row &&
            typeof row === 'object' &&
            !Array.isArray(row) &&
            row[key] === recordId,
        );
        if (index < 0)
          throw fail('RECORD_NOT_FOUND', `找不到记录 ${recordId}。`);
        const source = data.sources[index],
          sourceRun = await files.select(source.workId, (work) =>
            work.runs.find((r) => r.id === source.runId),
          );
        if (!sourceRun)
          throw fail('DELIVERY_SOURCE_INVALID', '来源运行不存在。');
        const producer = sourceRun.results.find(
            (r) => r.id === source.resultId,
          )!,
          entry = producer.outputs[source.port][source.index];
        const inputId = randomUUID();
        item.receivedInputs ??= [];
        item.receivedInputs.push({
          id: inputId,
          label: `${fixed.output} · ${recordId}`,
          value: patch
            ? patch.recordField
              ? {
                  ...structuredClone(patch.draft),
                  [patch.recordField]: structuredClone(data.rows![index]),
                }
              : {
                  ...structuredClone(data.rows![index] as Record<string, Json>),
                  ...structuredClone(patch.draft),
                }
            : structuredClone(data.rows![index]),
          ...(patch ? { revised: true } : {}),
          source: structuredClone(source),
          materials: entry.materialIds.map((id) => {
            const material = sourceRun.materials.find((m) => m.id === id);
            if (!material) throw fail('SOURCE_INVALID', '固定原始材料不存在。');
            return structuredClone(material);
          }),
        });
        selections.push({ kind: 'received', inputId });
      }
      await prepareItemInputs(
        item,
        { ...d, inputs: [port] },
        { [port]: selections },
        files,
        { readItem: items.get },
      );
      if (preparedMethod) {
        const saved = await flow.saveDraft(w.id, w.draftId, d);
        item.inputBindings = {};
        noteMethod(item);
        if (preparedMethod.template)
          item.uiProgram = {
            ...structuredClone(preparedMethod.template),
            id: randomUUID(),
            definitionId: saved,
          };
      }
      item.inputBindings = { ...item.inputBindings, [port]: selections };
    });
    return snapshot(id);
  }
  async function addInput(
    id: string,
    baseRevision: number,
    inputPort: string,
    label: string,
    value: Json,
    inputId?: string,
    materialIds?: string[],
  ) {
    if (typeof inputPort !== 'string' || !inputPort)
      throw fail('INPUT_PORT_MISSING', '请选择输入入口。');
    // Both manual and OpenUI revisions share the same input service and binding update.
    await items.reviseInput(id, {
      inputId,
      inputPort,
      label,
      value,
      materialIds,
      expectedRevision: baseRevision,
    });
    return snapshot(id);
  }
  async function bindInputs(
    id: string,
    baseRevision: number,
    inputBindings: Record<string, ItemInputSelection[]>,
  ) {
    await items.compositionChange(id, baseRevision, async (item) => {
      const work = await privateWork(item);
      if (!work.draftId) throw fail('FLOW_EMPTY', '请先保存本项处理流程。');
      const definition = await files.readDefinition(work.id, work.draftId);
      await prepareItemInputs(item, definition, inputBindings, files, {
        readItem: items.get,
      });
      item.inputBindings = structuredClone(inputBindings);
    });
    return snapshot(id);
  }
  async function selectInputs(
    id: string,
    baseRevision: number,
    inputPort: string,
    materialIds: string[],
  ) {
    await items.compositionChange(id, baseRevision, async (item) => {
      const w = await privateWork(item);
      if (!w.draftId) throw fail('FLOW_EMPTY', '请先保存流程。');
      const d = await files.readDefinition(w.id, w.draftId);
      if (!d.inputs.includes(inputPort))
        throw fail('INPUT_PORT_MISSING', '输入入口不存在。');
      if (
        !Array.isArray(materialIds) ||
        !materialIds.length ||
        new Set(materialIds).size !== materialIds.length
      )
        throw fail('INPUT_SOURCE_INVALID', '请选择不重复的材料。');
      const selected: ItemInputSelection[] = materialIds.map((materialId) => {
        if (!item.materials.some((m) => m.id === materialId))
          throw fail('INPUT_SOURCE_INVALID', '材料不属于本工作项。');
        return { kind: 'material', materialId };
      });
      await prepareItemInputs(
        item,
        { ...d, inputs: [inputPort] },
        { [inputPort]: selected },
        files,
        { readItem: items.get },
      );
      item.inputBindings = { ...item.inputBindings, [inputPort]: selected };
    });
    return snapshot(id);
  }
  async function upload(id: string, name: string, body: Buffer) {
    const item = await items.get(id),
      w = await privateWork(item),
      file = await files.saveUpload(w.id, name, body),
      text = await extractUploadText(file, body);
    await items.addEvidence(id, [`文件：${file}\n${text.text ?? text.gap}`]);
    return snapshot(id);
  }
  async function saveMethod(id: string, baseRevision: number, title: string) {
    let savedWorkId = '';
    await items.compositionChange(id, baseRevision, async (item) => {
      const w = await privateWork(item);
      if (!w.draftId) throw fail('METHOD_EMPTY', '请先保存处理流程。');
      const d = await files.readDefinition(w.id, w.draftId);
      if (d.nodes.some((n) => n.kind === 'file'))
        throw fail('METHOD_PRIVATE_FILE', '请先将私有文件改为输入。');
      for (const node of d.nodes)
        if (node.kind === 'call' && node.call) {
          const target = await files.read(node.call.workId);
          if (target.ownerItemId)
            throw fail('METHOD_PRIVATE_CALL', '请先将私有调用改为公共方法。');
        }
      if (
        typeof title !== 'string' ||
        !title.trim() ||
        Array.from(title).length > 80
      )
        throw fail('METHOD_TITLE_INVALID', '请输入1–80字标题。');
      const method = await works.createWork(item.goal, []);
      await works.rename(method.id, title);
      const saved = await files.writeDefinition(method.id, d);
      await files.change(method.id, (current) => {
        current.definitionIds.push(saved);
        current.adoptedId = saved;
        if (item.uiProgram && item.uiProgram.definitionId === w.draftId)
          current.uiProgramTemplate = {
            ...structuredClone(item.uiProgram),
            id: randomUUID(),
            definitionId: saved,
          };
      });
      savedWorkId = method.id;
    });
    return { ...(await snapshot(id)), savedWorkId };
  }
  async function childOutputs(
    id: string,
    offset = 0,
    limit = 20,
    scope: StageSourceScope = 'children',
    nodeId?: string,
  ) {
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50
    )
      throw Error('请使用有效分页范围：offset >= 0，limit 1–50。');
    const stages = await items.stageInputs(id, stageSourceScope(scope));
    const outputs = stages.children.flatMap((child) =>
      child.runs.flatMap((run) =>
        run.groups
          .filter((group) => !nodeId || group.nodeId === nodeId)
          .flatMap((group) =>
            group.outputs.map((output) => ({
              itemId: child.id,
              key: child.key,
              title: child.title,
              runStatus: run.status,
              nodeId: group.nodeId,
              label: group.label,
              final: group.final,
              ...output,
            })),
          ),
      ),
    );
    const pageOutputs = outputs.slice(offset, offset + limit);
    const pageIds = new Set(pageOutputs.map((output) => output.itemId));
    return {
      childrenTotal: stages.children.length,
      children: stages.children
        .filter((child) => scope === 'children' || pageIds.has(child.id))
        .map(({ id, key, title, excluded, issues }) => ({
          id,
          key,
          title,
          excluded,
          issues,
        })),
      scope,
      total: outputs.length,
      offset,
      outputs: pageOutputs,
      hasMore: offset + pageOutputs.length < outputs.length,
      note: '阶段成果不等于子项结项；sources必须明确选择，不能自动采用最新结果。每个子项绑定为一条{item,outputs}输入。',
    };
  }
  async function selectChildOutputs(
    id: string,
    revision: number,
    inputPort: string,
    selections: Extract<ItemInputSelection, { kind: 'child-results' }>[],
  ) {
    if (
      !Array.isArray(selections) ||
      !selections.length ||
      selections.some((ref) => ref.kind !== 'child-results')
    )
      throw Error('请明确选择子项及其固定阶段成果。');
    await items.compositionChange(id, revision, async (current) => {
      const work = await privateWork(current);
      if (!work.draftId) throw Error('先保存处理流程。');
      const definition = await files.readDefinition(work.id, work.draftId);
      if (!definition.inputs.includes(inputPort))
        throw Error('输入入口不存在。');
      await prepareItemInputs(
        current,
        {
          ...definition,
          inputs: [inputPort],
          inputContracts: definition.inputContracts?.[inputPort]
            ? { [inputPort]: definition.inputContracts[inputPort] }
            : {},
        },
        { [inputPort]: selections },
        files,
        { readItem: (itemId) => items.get(itemId) },
      );
      current.inputBindings = {
        ...current.inputBindings,
        [inputPort]: structuredClone(selections),
      };
    });
    return snapshot(id);
  }
  return {
    rawItem: items.get,
    version,
    snapshot,
    readInputs,
    readOutput,
    init: snapshot,
    methods,
    privateWork,
    check,
    saveFlow,
    checkUiProgram,
    saveUiProgram,
    publishDelivery,
    continueRecords,
    addInput,
    selectInputs,
    bindInputs,
    upload,
    saveMethod,
    useMethod,
    checkWorkspace: (id: string, proposal: WorkspaceCheckProposal = {}) =>
      checkWorkspace(id, proposal, {
        files,
        items,
        check,
        checkUiProgram,
        readDelivery,
      }),
    record: async (id: string, deliveryId: string, recordId: string) => {
      const item = await items.get(id),
        delivery = item.deliveries.find((d) => d.id === deliveryId);
      if (!delivery?.recordContract)
        throw fail('DELIVERY_NOT_FOUND', '指定记录交付不存在。');
      const data = await readDelivery(item, delivery, false, recordId),
        row = data.rows?.[0];
      if (row === undefined) throw fail('RECORD_NOT_FOUND', '指定记录不存在。');
      return { value: row };
    },
    childOutputs,
    selectChildOutputs,
    previewChildOutput: (
      id: string,
      selection: Extract<ItemInputSelection, { kind: 'child-results' }>,
    ) => items.stagePreview(id, selection),
    itemScope: async (id: string, page = 1, pageSize = 50) => {
      const pageView = await items.summaries({
        rootId: id,
        view: 'all',
        page,
        pageSize,
      });
      const queues = new Map<string, { batchId: string; status: string }[]>(),
        batches = [];
      const source = readBatches?.();
      if (source)
        for (const header of source.list()) {
          if (
            header.parentId !== id &&
            !(await withinStageScope(
              id,
              await items.get(header.parentId),
              items.get,
              'descendants',
            ))
          )
            continue;
          batches.push(header);
          for (const entry of source.get(header.id).entries)
            queues.set(entry.itemId, [
              ...(queues.get(entry.itemId) ?? []),
              { batchId: header.id, status: entry.status },
            ]);
        }
      return {
        asOf: new Date().toISOString(),
        ...pageView,
        batches,
        items: pageView.items.map((row) => ({
          ...row,
          queues: queues.get(row.id) ?? [],
        })),
      };
    },
  };
}
