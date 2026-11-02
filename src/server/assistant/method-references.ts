import type { MethodCapability } from '../../shared/workitem-composition.ts';

export const methodReferenceGuide = `用户可在聊天中显式引用流水线。referencedMethods 是本轮经服务端核对的固定保存版本与完整合同，和用户指令一起理解；不能只按名称猜测版本，也不自动改成最新采用版。引用仅提供关注上下文，不授权运行。用户要求采用某方法时，将真实call及输入/输出承接保存到流程，用check_workspace核对实际输入和界面，再读回确认；不适用时说明合同或材料缺口，不用普通节点假冒。find_methods支持query/offset/limit分页，hasMore为true时可继续读完整目录，inspect_method读取具体保存版本。`;

/** Resolve only catalog entries; neither a display name nor a client-supplied title is authority. */
export function resolveMethodReferences(
  input: unknown,
  catalog: MethodCapability[],
) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 8)
    throw Error('一次最多引用8个流水线版本。');
  const selected: MethodCapability[] = [],
    seen = new Set<string>();
  for (const reference of input) {
    if (
      !reference ||
      typeof reference.workId !== 'string' ||
      typeof reference.definitionId !== 'string'
    )
      throw Error('流水线引用需要明确的工作与保存版本，请重新选择。');
    const method = catalog.find(
      (m) =>
        m.workId === reference.workId &&
        m.definitionId === reference.definitionId,
    );
    if (!method)
      throw Error('引用的流水线版本不在当前可用目录中，请重新选择。');
    const key = JSON.stringify([method.workId, method.definitionId]);
    if (!seen.has(key)) {
      seen.add(key);
      selected.push(method);
    }
  }
  return selected;
}
