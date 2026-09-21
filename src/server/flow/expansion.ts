import type { Definition, FlowNode } from '../../shared/records.ts';
import { validateForRun } from './index.ts';
/** 动态子图只复用现有有限语言，第一版禁止递归展开。 */
export function validateExpansion(value: unknown, node: FlowNode): Definition {
  const definition = value as Definition;
  validateForRun(definition);
  if (definition.nodes.length > node.dynamic!.maxNodes)
    throw Error('动态提案超过节点上限。');
  if (
    JSON.stringify(definition.inputs) !== '["input"]' ||
    Object.keys(definition.outputs).length !== 1 ||
    !definition.outputs.output
  )
    throw Error('动态子图只接受 input 输入和 output 输出。');
  if (definition.nodes.some((n) => n.kind === 'dynamic'))
    throw Error('动态提案必须落到具体步骤，不能继续 Dynamic。');
  if (!definition.nodes.some((n) => ['agent', 'function'].includes(n.kind)))
    throw Error('动态提案缺少具体工作。');
  if (definition.nodes.some((n) => !n.contract))
    throw Error('动态子图每步必须明确职责、完成条件和结构依据。');
  // 所有生成责任必须能够影响明确输出，避免悄悄执行脱离目标的工作。
  const ancestors = new Set<string>();
  const visit = (id: string) => {
    if (ancestors.has(id) || id === '$input') return;
    ancestors.add(id);
    for (const e of definition.edges.filter((e) => e.to[0] === id))
      visit(e.from[0]);
  };
  visit(definition.outputs.output[0]);
  if (definition.nodes.some((n) => !ancestors.has(n.id)))
    throw Error('动态提案包含与局部输出无关的步骤。');
  return structuredClone(definition);
}
