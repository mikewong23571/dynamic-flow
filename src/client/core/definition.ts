import type { Definition, Snapshot, FlowNode } from '../../shared/records';

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
    ...(definition.summaryOutput
      ? {
          summaryOutput:
            definition.outputs[definition.summaryOutput]?.[0] === nodeId
              ? undefined
              : definition.summaryOutput,
        }
      : {}),
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
/** Display the operation encoded in the IR, independently of its business label. */
export function nodePrimitive(node: FlowNode, native = false): string {
  if (native) {
    if (node.kind === 'call') return `call · ${node.operation}`;
    if (node.kind === 'function')
      return node.functionName === 'expression'
        ? node.expression?.kind || 'expression'
        : node.functionName || 'function';
    return node.kind;
  }
  if (node.kind === 'call')
    return node.operation === 'map' ? '逐项应用' : '整批应用';
  if (node.kind === 'branch') return '条件分路';
  if (node.kind === 'function') {
    const functions: Record<string, string> = {
      collect: '多路收集',
      merge: '合并集合',
      join: '按键关联',
      groupBy: '分组',
      identity: '透传',
      'select-fields': '字段映射',
    };
    if (functions[node.functionName || ''])
      return functions[node.functionName!];
    if (node.functionName === 'expression') {
      const expressions: Record<string, string> = {
        match: '模式匹配',
        reduce: '归约',
        flatMap: '展开集合',
        map: '逐项映射',
        filter: '筛选',
        object: '构造记录',
        array: '构造列表',
      };
      if (expressions[node.expression?.kind || ''])
        return expressions[node.expression!.kind];
    }
    return node.operation === 'flatMap' ? '展开集合' : '数据变换';
  }
  return (
    {
      agent: 'AI 分析',
      file: '文件输入',
      wait: '等待事件',
      milestone: '记录里程碑',
      dynamic: '动态展开',
      'create-items': '拆分工作项',
    }[node.kind] || '处理步骤'
  );
}
