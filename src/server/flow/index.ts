import { schemaIssue, incompatibleTypes } from './schema.ts';
import type {
  Definition,
  FlowNode,
  Issue,
  Snapshot,
  ViewState,
} from '../../shared/records.js';
import type { FileStore } from '../files/index.js';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function pair(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((v) => typeof v === 'string')
  );
}
function assertShape(value: unknown): asserts value is Definition {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.inputs) ||
    !value.inputs.every((v) => typeof v === 'string') ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.edges) ||
    !object(value.outputs)
  )
    throw new Error(
      '流程定义结构无效：需要 inputs、nodes、edges、outputs 和 schemaVersion: 1。',
    );
  for (const node of value.nodes) {
    if (
      !object(node) ||
      typeof node.id !== 'string' ||
      typeof node.label !== 'string' ||
      !['agent', 'function', 'branch', 'wait', 'milestone'].includes(
        node.kind as string,
      ) ||
      !['each', 'all'].includes(node.mode as string)
    )
      throw new Error('节点结构无效：需要 id、label、支持的 kind 和 mode。');
    if (node.task !== undefined && typeof node.task !== 'string')
      throw new Error(`节点 ${node.id} 的任务必须是文本。`);
    if (
      node.functionName !== undefined &&
      typeof node.functionName !== 'string'
    )
      throw new Error(`节点 ${node.id} 的函数名称必须是文本。`);
    if (
      node.params !== undefined &&
      (!object(node.params) ||
        (node.params.fields !== undefined &&
          (!Array.isArray(node.params.fields) ||
            !node.params.fields.every((v) => typeof v === 'string'))))
    )
      throw new Error(`节点 ${node.id} 的字段参数必须是文本列表。`);
    if (
      node.condition !== undefined &&
      (!object(node.condition) ||
        typeof node.condition.field !== 'string' ||
        typeof node.condition.operator !== 'string')
    )
      throw new Error(`节点 ${node.id} 的条件结构无效。`);
  }
  if (
    !value.edges.every(
      (edge) => object(edge) && pair(edge.from) && pair(edge.to),
    ) ||
    !Object.values(value.outputs).every(pair)
  )
    throw new Error('连接和输出必须明确指定 [节点, 端口]。');
}
export function inputPorts(node: FlowNode): string[] {
  return node.kind === 'function' && node.functionName === 'merge'
    ? ['left', 'right']
    : ['input'];
}
export function outputPorts(node: FlowNode): string[] {
  return node.kind === 'branch'
    ? ['matched', 'unmatched']
    : node.kind === 'wait'
      ? ['output', 'event']
      : ['output'];
}
export function checkDefinition(definition: Definition): Issue[] {
  try {
    assertShape(definition);
  } catch (error) {
    return [{ message: (error as Error).message, field: 'definition' }];
  }
  const issues: Issue[] = [];
  const nodes = new Map<string, FlowNode>();
  if (
    !definition.inputs.length ||
    definition.inputs.some((p) => !p.trim()) ||
    new Set(definition.inputs).size !== definition.inputs.length
  )
    issues.push({
      field: 'inputs',
      message: '请设置至少一个不重复且非空的流程输入名称。',
    });
  if (!definition.nodes.length)
    issues.push({ field: 'nodes', message: '请添加至少一个处理节点。' });
  for (const node of definition.nodes) {
    const add = (message: string, field?: string) =>
      issues.push({ nodeId: node.id, message, field });
    if (!node.id.trim() || node.id === '$input' || nodes.has(node.id))
      add('节点 ID 不能为空、重复或使用保留名称 $input。', 'id');
    nodes.set(node.id, node);
    if (!node.label.trim()) add('请填写节点名称。', 'label');
    if (
      node.operation !== undefined &&
      !['map', 'flatMap', 'aggregate'].includes(node.operation)
    )
      add('请选择 map、flatMap 或 aggregate。', 'operation');
    if (
      node.concurrency !== undefined &&
      (!Number.isInteger(node.concurrency) ||
        node.concurrency < 1 ||
        node.concurrency > 8)
    )
      add('并发数应为 1–8 的整数。', 'concurrency');
    for (const key of ['inputSchema', 'expectedOutput'] as const) {
      if (node[key] !== undefined) {
        const error = schemaIssue(node[key]!);
        if (error) add(`Schema 无效：${error}`, key);
      }
    }
    if (
      ['wait', 'milestone', 'branch'].includes(node.kind) &&
      node.operation &&
      node.operation !== 'aggregate'
    )
      add('控制节点只支持 aggregate。', 'operation');
    if (node.kind === 'wait') {
      if (
        !node.wait ||
        typeof node.wait.event !== 'string' ||
        !node.wait.event.trim() ||
        typeof node.wait.reason !== 'string' ||
        !node.wait.reason.trim()
      )
        add('等待需要事件名称和原因。', 'wait');
      if (
        node.wait?.timeoutSeconds !== undefined &&
        (!Number.isFinite(node.wait.timeoutSeconds) ||
          node.wait.timeoutSeconds <= 0)
      )
        add('等待期限必须大于零。', 'wait.timeoutSeconds');
    }
    if (
      node.kind === 'milestone' &&
      (!node.milestone ||
        typeof node.milestone.stage !== 'string' ||
        !node.milestone.stage.trim() ||
        typeof node.milestone.summary !== 'string' ||
        !node.milestone.summary.trim())
    )
      add('里程碑需要阶段和进展摘要。', 'milestone');
    if (node.kind === 'agent' && !node.task?.trim())
      add('请填写节点任务，再运行此步骤。', 'task');
    if (node.kind === 'function') {
      if (
        !['identity', 'select-fields', 'merge'].includes(
          node.functionName ?? '',
        )
      )
        add(
          '请选择已有处理函数：identity、select-fields 或 merge。',
          'functionName',
        );
      if (
        node.functionName === 'select-fields' &&
        (!node.params?.fields?.length ||
          node.params.fields.some((f) => !f.trim()))
      )
        add('请选择至少一个需要保留的字段。', 'params.fields');
      if (
        node.functionName === 'merge' &&
        (node.mode !== 'all' ||
          (node.operation !== undefined && node.operation !== 'aggregate'))
      )
        add('汇合节点必须使用集合模式 all。', 'mode');
    }
    if (node.kind === 'branch') {
      if (node.mode !== 'all')
        add('条件分流一次处理集合，请使用 all 模式。', 'mode');
      if (!node.condition || typeof node.condition.field !== 'string')
        add(
          '请设置要判断的字段；空文本表示判断整个输入值。',
          'condition.field',
        );
      if (
        !['equals', 'contains', 'exists'].includes(
          node.condition?.operator ?? '',
        )
      )
        add('请选择 equals、contains 或 exists 条件。', 'condition.operator');
      if (
        node.condition &&
        node.condition.operator !== 'exists' &&
        node.condition.value === undefined
      )
        add('请填写条件比较值。', 'condition.value');
    }
  }
  const incoming = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  const validSource = ([id, port]: [string, string]) =>
    id === '$input'
      ? definition.inputs.includes(port)
      : nodes.has(id) && outputPorts(nodes.get(id)!).includes(port);
  definition.edges.forEach((edge, edgeIndex) => {
    const target = nodes.get(edge.to[0]);
    if (!validSource(edge.from))
      issues.push({
        edgeIndex,
        nodeId: edge.from[0],
        message: '连接来源节点或输出端口不存在；请重新连接有效输出。',
      });
    if (!target || !inputPorts(target).includes(edge.to[1]))
      issues.push({
        edgeIndex,
        nodeId: edge.to[0],
        message: '连接目标节点或输入端口不匹配；请连接有效输入。',
      });
    const source = nodes.get(edge.from[0]);
    if (
      source &&
      target &&
      edge.from[1] === 'output' &&
      source.expectedOutput !== undefined &&
      target.inputSchema !== undefined
    ) {
      const sourceOperation =
        source.operation ?? (source.mode === 'each' ? 'map' : 'aggregate');
      const targetOperation = ['wait', 'milestone', 'branch'].includes(
        target.kind,
      )
        ? 'aggregate'
        : (target.operation ?? (target.mode === 'each' ? 'map' : 'aggregate'));
      let schema = source.expectedOutput;
      if (
        (sourceOperation === 'flatMap' ||
          ['wait', 'milestone', 'branch'].includes(source.kind)) &&
        schema &&
        typeof schema === 'object' &&
        !Array.isArray(schema)
      )
        schema = schema.items ?? true;
      const received =
        targetOperation === 'aggregate'
          ? { type: 'array', items: schema }
          : schema;
      if (incompatibleTypes(received, target.inputSchema))
        issues.push({
          edgeIndex,
          nodeId: target.id,
          message: '上游输出与下游输入 schema 类型不相容。',
        });
    }
    const key = JSON.stringify(edge.to);
    if (incoming.has(key))
      issues.push({
        edgeIndex,
        nodeId: edge.to[0],
        message: '同一输入端口有多个来源；请使用显式汇合节点。',
      });
    incoming.set(key, edgeIndex);
    if (nodes.has(edge.from[0]) && target)
      adjacency.set(edge.from[0], [
        ...(adjacency.get(edge.from[0]) ?? []),
        edge.to[0],
      ]);
  });
  for (const node of definition.nodes)
    for (const port of inputPorts(node))
      if (!incoming.has(JSON.stringify([node.id, port])))
        issues.push({
          nodeId: node.id,
          field: port,
          message: `缺少 ${port} 输入连接；请选择材料输入或连接上游输出。`,
        });
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const walk = (id: string) => {
    if (visiting.has(id)) {
      issues.push({
        nodeId: id,
        message: '流程包含不支持的回连或环；请断开回连，使用逐项模式处理集合。',
      });
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) walk(next);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of nodes.keys()) walk(id);
  if (!Object.keys(definition.outputs).length)
    issues.push({ field: 'outputs', message: '请选择流程的最终输出。' });
  for (const [name, source] of Object.entries(definition.outputs))
    if (!name.trim() || !validSource(source))
      issues.push({
        field: `outputs.${name}`,
        message: '流程输出引用无效；请选择存在的节点输出端口。',
      });
  return issues;
}
export function validateForRun(definition: Definition): void {
  const issues = checkDefinition(definition);
  if (issues.length)
    throw Object.assign(new Error(issues.map((i) => i.message).join('\n')), {
      issues,
    });
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (object(value))
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export function createFlow(files: FileStore) {
  async function known(workId: string, id: string) {
    if (!(await files.read(workId)).definitionIds.includes(id))
      throw new Error('该定义版本不属于当前工作。');
    return files.readDefinition(workId, id);
  }
  return {
    async saveDraft(
      workId: string,
      expectedDraftId: string | undefined,
      definition: Definition,
    ): Promise<string> {
      assertShape(definition);
      definition = structuredClone(definition);
      const current = await files.read(workId);
      if (current.draftId !== expectedDraftId)
        throw new Error(
          '草稿已变化，请查看最新版本后重试；本次修改未覆盖草稿。',
        );
      let id: string;
      if (
        current.draftId &&
        canonical(await files.readDefinition(workId, current.draftId)) ===
          canonical(definition)
      )
        id = current.draftId;
      else id = await files.writeDefinition(workId, definition);
      await files.change(workId, (work) => {
        if (work.draftId !== expectedDraftId)
          throw new Error(
            '草稿已变化，请查看最新版本后重试；本次修改未覆盖草稿。',
          );
        if (!work.definitionIds.includes(id)) work.definitionIds.push(id);
        work.draftId = id;
        work.draftBaseId ??= id;
      });
      return id;
    },
    async beginCandidate(
      workId: string,
      sourceId: string,
      replaceExisting = false,
    ): Promise<string> {
      await known(workId, sourceId);
      await files.change(workId, (work) => {
        if (work.draftId === sourceId) return;
        if (work.draftId && work.draftId !== work.adoptedId && !replaceExisting)
          throw new Error('已有不同的候选草稿，请继续现有草稿或明确确认替换。');
        work.draftId = sourceId;
        work.draftBaseId = sourceId;
      });
      return sourceId;
    },
    async saveLayout(workId: string, view: ViewState): Promise<void> {
      if (
        !object(view) ||
        !object(view.positions) ||
        Object.values(view.positions).some(
          (p) => !object(p) || !Number.isFinite(p.x) || !Number.isFinite(p.y),
        ) ||
        (view.viewport &&
          (!Number.isFinite(view.viewport.x) ||
            !Number.isFinite(view.viewport.y) ||
            !Number.isFinite(view.viewport.zoom) ||
            view.viewport.zoom <= 0))
      )
        throw new Error('画布位置与缩放必须是有效数值。');
      await files.change(workId, (work) => {
        work.view = structuredClone(view);
      });
    },
    async adopt(workId: string, definitionId: string): Promise<void> {
      validateForRun(await known(workId, definitionId));
      await files.change(workId, (work) => {
        work.adoptedId = definitionId;
        if (work.draftId === definitionId) work.draftBaseId = definitionId;
      });
    },
    async discardDraft(workId: string): Promise<void> {
      await files.change(workId, (work) => {
        work.draftId = work.adoptedId;
        work.draftBaseId = work.adoptedId;
      });
    },
    async snapshot(workId: string): Promise<Snapshot> {
      const work = await files.read(workId),
        definitions: Record<string, Definition> = {};
      for (const id of work.definitionIds)
        definitions[id] = await files.readDefinition(workId, id);
      const current = work.draftId ?? work.adoptedId;
      return {
        work,
        definitions,
        issues: current ? checkDefinition(definitions[current]) : [],
      };
    },
  };
}
export type FlowService = ReturnType<typeof createFlow>;
