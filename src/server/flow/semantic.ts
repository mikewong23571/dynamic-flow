import type { Definition, FlowNode, Issue } from '../../shared/records.ts';
import { checkExpression } from './expressions.ts';
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown) => typeof v === 'string' && !!v.trim();
export function checkProblem(problem: Definition['problem']): Issue[] {
  if (problem === undefined) return [];
  if (!object(problem))
    return [{ field: 'problem', message: '问题认知必须是对象。' }];
  return (['framing', 'known', 'unknown', 'constraints', 'evidence'] as const)
    .filter((k) => typeof problem[k] !== 'string')
    .map((k) => ({
      field: `problem.${k}`,
      message: '问题认知字段必须为文本。',
    }));
}
export function checkSemantic(node: FlowNode): Issue[] {
  const issues: Issue[] = [];
  const add = (field: string, message: string) =>
    issues.push({ nodeId: node.id, field, message });
  if (node.contract !== undefined) {
    if (!object(node.contract)) add('contract', '步骤合同必须是对象。');
    else {
      for (const k of ['responsibility', 'done', 'rationale'] as const)
        if (!text(node.contract[k]))
          add(`contract.${k}`, '请明确职责、完成条件和结构依据。');
      if (
        node.contract.semanticRole !== undefined &&
        typeof node.contract.semanticRole !== 'string'
      )
        add('contract.semanticRole', '同类对象角色必须是文本。');
    }
  }
  if (node.kind === 'dynamic') {
    if (!node.task?.trim() || !node.contract)
      add('dynamic', '局部展开需要目标和步骤合同。');
    if (
      !object(node.dynamic) ||
      !text(node.dynamic.boundary) ||
      !Number.isInteger(node.dynamic.maxNodes) ||
      node.dynamic.maxNodes < 1 ||
      node.dynamic.maxNodes > 20
    )
      add('dynamic', '局部展开需要明确边界和 1–20 个节点上限。');
    if (
      node.mode !== 'all' ||
      (node.operation && node.operation !== 'aggregate')
    )
      add('dynamic', '局部展开一次规划当前整批上下文。');
  }
  if (node.repeat !== undefined) {
    if (
      !object(node.repeat) ||
      !Number.isInteger(node.repeat.max) ||
      node.repeat.max < 1 ||
      node.repeat.max > 10
    )
      add('repeat.max', '迭代上限须为 1–10 的整数。');
    if (
      !['agent', 'function'].includes(node.kind) ||
      ['merge', 'collect', 'join'].includes(node.functionName ?? '') ||
      node.operation !== 'map'
    )
      add('repeat', '迭代用于逐项步骤；每轮返回一个值并作为下一轮输入。');
    if (node.repeat?.until !== undefined)
      for (const issue of checkExpression(node.repeat.until))
        add(`repeat.until.${issue.field}`, issue.message);
  }
  return issues;
}
