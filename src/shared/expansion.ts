import type { Definition, Run } from './records.ts';
/** 展开是 Run 的事实；按需投影成同一执行图，不保存第二份可编辑定义。 */
export function materializeDefinition(
  definition: Definition,
  expansions: NonNullable<Run['expansions']>,
): Definition {
  const result = structuredClone(definition);
  for (const expansion of expansions) {
    const original = result.nodes.find((n) => n.id === expansion.nodeId);
    if (!original || original.kind !== 'dynamic')
      throw Error('展开位置不存在或不再是动态步骤。');
    const prefix = `${original.id}/`;
    const incoming = result.edges.find((e) => e.to[0] === original.id);
    if (!incoming) throw Error('动态步骤缺少输入来源。');
    const endpoint = ([id, port]: [string, string]): [string, string] =>
      id === '$input' ? incoming.from : [prefix + id, port];
    const newNodes = expansion.definition.nodes.map((n) => ({
      ...structuredClone(n),
      id: prefix + n.id,
    }));
    if (
      newNodes.some((n) =>
        result.nodes.some((existing) => existing.id === n.id),
      )
    )
      throw Error('展开步骤 ID 与现有步骤冲突。');
    // 原动态位置成为稳定的输出边界，后续连接和局部结果身份不变。
    result.nodes = result.nodes.map((n) =>
      n.id === original.id
        ? {
            id: n.id,
            label: n.label,
            kind: 'function' as const,
            mode: 'each' as const,
            operation: 'map' as const,
            functionName: 'identity' as const,
            contract: n.contract,
            expectedOutput: n.expectedOutput,
          }
        : n,
    );
    result.nodes.push(...newNodes);
    result.edges = result.edges.filter((e) => e.to[0] !== original.id);
    result.edges.push(
      ...expansion.definition.edges.map((e) => ({
        from: endpoint(e.from),
        to: endpoint(e.to),
      })),
    );
    result.edges.push({
      from: endpoint(expansion.definition.outputs.output),
      to: [original.id, 'input'],
    });
  }
  return result;
}
