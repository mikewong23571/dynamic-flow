import type {
  Definition,
  InputContract,
  Issue,
  Json,
} from '../../shared/records.ts';
import { schemaIssue, validateValue } from './schema.ts';

/** 契约结构问题：端口须存在、schema 可编译、违约行为合法。宽松端口不声明契约。 */
export function checkInputContracts(definition: Definition): Issue[] {
  const issues: Issue[] = [];
  const contracts = definition.inputContracts ?? {};
  for (const [port, contract] of Object.entries(contracts)) {
    if (!definition.inputs.includes(port))
      issues.push({
        field: `inputContracts.${port}`,
        message: `输入契约的端口「${port}」不在流程输入 inputs 中。`,
      });
    if (contract.item !== undefined) {
      const problem = schemaIssue(contract.item as Json);
      if (problem)
        issues.push({
          field: `inputContracts.${port}.item`,
          message: `输入契约 schema 无法编译：${problem}`,
        });
    }
    if (
      contract.onInvalid !== undefined &&
      !['reject', 'interpret'].includes(contract.onInvalid)
    )
      issues.push({
        field: `inputContracts.${port}.onInvalid`,
        message: `违约行为只支持 reject / interpret。`,
      });
  }
  return issues;
}

export interface InvocationIssue {
  port: string;
  index: number;
  message: string;
}

/** 严格入口校验：对 invoke 裸值逐端口逐条检查；返回的问题按 reject/interpret 分组的由调用方决定。 */
export function validateInvocation(
  definition: Definition,
  inputs: Record<string, unknown[]>,
): InvocationIssue[] {
  const contracts = definition.inputContracts ?? {};
  const issues: InvocationIssue[] = [];
  for (const [port, contract] of Object.entries(contracts)) {
    const values = inputs[port] ?? [];
    if (contract.required !== false && values.length === 0) {
      issues.push({ port, index: -1, message: `端口「${port}」必须提供输入。` });
      continue;
    }
    if (!contract.item) continue;
    values.forEach((value, index) => {
      try {
        validateValue(contract.item as Json, value as Json, `端口「${port}」第 ${index + 1} 条`);
      } catch (error) {
        issues.push({
          port,
          index,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }
  return issues;
}

/** 某端口的违约行为（缺省 reject）。 */
export function invalidPolicy(contract: InputContract | undefined) {
  return contract?.onInvalid ?? 'reject';
}
