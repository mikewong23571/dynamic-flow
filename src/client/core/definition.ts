import type { Definition, Snapshot } from '../../shared/records';

export function acceptSnapshot(
  previous: Snapshot | null,
  next: Snapshot,
): Snapshot {
  return previous?.work.id === next.work.id &&
    previous.work.revision > next.work.revision
    ? previous
    : next;
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
/** 该节点是否登记为最终产物。 */
export function isFinalOutput(
  definition: Definition | undefined,
  nodeId: string,
): boolean {
  return Object.values(definition?.outputs || {}).some((v) => v[0] === nodeId);
}
/** 连接端点显示名：材料入口或节点标签。 */
export function nodeLabel(definition: Definition, id: string): string {
  return id === '$input'
    ? '工作材料'
    : definition.nodes.find((n) => n.id === id)?.label || id;
}
/** 批次输入节点只在有外部输入端口时出现在画布；file 来源流程 inputs 为空，不渲染孤立的 $input。 */
export function hasBatchInputs(definition: Definition): boolean {
  return definition.inputs.length > 0;
}
export function changeSummary(
  before: Definition | undefined,
  after: Definition | undefined,
): string[] {
  if (!after) return [];
  if (!before) return ['新建流程'];
  const lines: string[] = [];
  if (JSON.stringify(before.problem) !== JSON.stringify(after.problem))
    lines.push('更新问题认知与依据');
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
