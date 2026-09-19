import type {
  Comparison,
  Definition,
  FlowNode,
  Inputs,
  NodeResult,
  Snapshot,
  Work,
} from '../shared/records';
export const statusNames: Record<string, string> = {
  queued: '等待中',
  running: '运行中',
  stopping: '正在停止',
  completed: '已完成',
  failed: '失败',
  cancelled: '已停止',
  interrupted: '已中断',
  blocked: '依赖失败',
  waiting: '等待事件',
};
export const active = (status?: string) =>
  ['queued', 'running', 'stopping', 'waiting'].includes(status || '');
export const short = (id?: string) => (id ? id.slice(0, 8) : '尚未生成');
export const splitMaterials = (text: string) =>
  text
    .split(/\n\s*\n|\n/)
    .map((x) => x.trim())
    .filter(Boolean);
export const materialInputs = (
  work: Work,
  ids: string[],
  port = 'input',
): Inputs => ({
  [port]: work.materials
    .filter((m) => ids.includes(m.id))
    .map((m) => ({
      sampleId: m.id,
      value: m.text,
      materialIds: [m.id],
      sourceResultIds: [],
    })),
});
export function inputFingerprint(inputs: Inputs) {
  return JSON.stringify(
    Object.keys(inputs)
      .sort()
      .map((port) => [
        port,
        [...inputs[port]]
          .sort((a, b) => a.sampleId.localeCompare(b.sampleId))
          .map((i) => ({
            sampleId: i.sampleId,
            value: i.value,
            materialIds: [...i.materialIds].sort(),
            sourceResultIds: [...i.sourceResultIds].sort(),
          })),
      ]),
  );
}
export const comparisonStale = (
  comparison: Comparison,
  draftId: string | undefined,
  inputs: Inputs,
  hasUnsavedChanges = false,
) =>
  hasUnsavedChanges ||
  comparison.candidateId !== draftId ||
  inputFingerprint(comparison.frozenInputs) !== inputFingerprint(inputs);
export function acceptSnapshot(
  previous: Snapshot | null,
  next: Snapshot,
): Snapshot {
  return previous?.work.id === next.work.id &&
    previous.work.revision > next.work.revision
    ? previous
    : next;
}
export function inputPorts(node: FlowNode) {
  return node.functionName === 'merge' ? ['left', 'right'] : ['input'];
}
export function outputPorts(node: FlowNode) {
  return node.kind === 'branch'
    ? ['matched', 'unmatched']
    : node.kind === 'wait'
      ? ['output', 'event']
      : ['output'];
}
export function removeNode(definition: Definition, nodeId: string): Definition {
  return {
    ...definition,
    nodes: definition.nodes.filter((n) => n.id !== nodeId),
    edges: definition.edges.filter(
      (e) => e.from[0] !== nodeId && e.to[0] !== nodeId,
    ),
    outputs: Object.fromEntries(
      Object.entries(definition.outputs).filter(([, v]) => v[0] !== nodeId),
    ),
  };
}
export function changeSummary(
  before: Definition | undefined,
  after: Definition | undefined,
): string[] {
  if (!after) return [];
  if (!before) return ['新建流程'];
  const lines: string[] = [];
  for (const n of after.nodes) {
    const old = before.nodes.find((x) => x.id === n.id);
    if (!old) lines.push(`新增「${n.label}」`);
    else if (JSON.stringify(n) !== JSON.stringify(old))
      lines.push(`修改「${n.label}」的配置`);
  }
  for (const n of before.nodes)
    if (!after.nodes.some((x) => x.id === n.id))
      lines.push(`删除「${n.label}」`);
  if (JSON.stringify(before.edges) !== JSON.stringify(after.edges))
    lines.push('调整步骤连接');
  if (JSON.stringify(before.outputs) !== JSON.stringify(after.outputs))
    lines.push('调整最终输出');
  return lines;
}
export function resultItems(result: NodeResult) {
  return Object.values(result.outputs).flat();
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    path,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || `请求失败 (${response.status})`);
  return data as T;
}

export const portLabel = (port: string) =>
  ({
    event: '触发事件',
    input: '输入',
    output: '输出',
    matched: '符合条件',
    unmatched: '其他',
    left: '左路',
    right: '右路',
    materials: '材料',
    feedback: '反馈',
  })[port] || port;
export function localInputs(
  node: FlowNode | undefined,
  items: Inputs,
  port: string,
): Inputs {
  const ports = node ? inputPorts(node) : [port];
  return Object.fromEntries(
    ports.map((p) => [p, p === port ? Object.values(items).flat() : []]),
  );
}

export function nodeTotal(
  run: import('../shared/records').Run,
  nodeId: string,
) {
  const totals = (
    run as import('../shared/records').Run & {
      nodeTotals?: Record<string, number>;
    }
  ).nodeTotals;
  return (
    totals?.[nodeId] ?? run.results.filter((r) => r.nodeId === nodeId).length
  );
}

export const workTitle = (work: Pick<Work, 'title' | 'goal'>) =>
  work.title || Array.from(work.goal.trim()).slice(0, 28).join('');
