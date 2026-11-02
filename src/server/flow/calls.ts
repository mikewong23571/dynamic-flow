import type {
  Definition,
  FlowNode,
  Issue,
  Json,
} from '../../shared/records.ts';
import { callConfigSchema } from '../../shared/node-ports.ts';
import { validateValue } from './schema.ts';
import type { FileStore } from '../files/index.ts';
import { validateForRun } from './index.ts';

const names = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((n) => typeof n === 'string' && !!n.trim() && n === n.trim()) &&
  new Set(value).size === value.length;
export function checkCall(node: FlowNode): Issue[] {
  const issues: Issue[] = [];
  const add = (field: string, message: string) =>
    issues.push({ nodeId: node.id, field, message });
  if (node.kind !== 'call') {
    if (node.call !== undefined) add('call', '方法调用配置只用于 call 节点。');
    return issues;
  }
  const call = node.call;
  if (!call || typeof call !== 'object' || Array.isArray(call)) {
    add('call', '请选择保存的方法版本及具名输入输出。');
    return issues;
  }
  try {
    validateValue(callConfigSchema, call as unknown as Json, '调用配置');
  } catch (error) {
    add('call', (error as Error).message);
    return issues;
  }
  for (const field of ['workId', 'definitionId'] as const)
    if (typeof call[field] !== 'string' || !call[field].trim())
      add(`call.${field}`, '方法调用必须指定固定工作与保存版本。');
  for (const field of ['inputNames', 'outputNames'] as const)
    if (!names(call[field]))
      add(`call.${field}`, '调用端口必须是不重复的非空名称。');
  if (!['map', 'aggregate'].includes(node.operation ?? ''))
    add('operation', '方法调用支持 map 或 aggregate，请明确选择。');
  if (node.operation === 'map') {
    if (!call.inputNames?.includes(call.eachPort ?? ''))
      add('call.eachPort', '请选择逐项派发的输入端口；其他端口整批共享。');
  }
  if (node.operation !== 'map' && call.eachPort !== undefined)
    add('call.eachPort', '整批调用不设置逐项端口。');
  return issues;
}

/** Resolves immutable interfaces before dispatch; current adopted versions are irrelevant. */
export async function validateCallReferences(
  files: FileStore,
  workId: string,
  definitionId: string,
  definition?: Definition,
  itemId?: string,
  ancestors: string[] = [],
): Promise<void> {
  const loaded = new Map<string, Definition>();
  const checked = new Set<string>();
  const visit = async (
    wid: string,
    did: string,
    def: Definition | undefined,
    path: string[],
  ) => {
    const key = JSON.stringify([wid, did]);
    if (path.includes(key)) throw Error('方法调用包含递归或循环引用。');
    if (path.length >= 32) throw Error('方法调用嵌套超过 32 层，请简化组合。');
    if (checked.has(key)) return;
    def ??= loaded.get(key) ?? (await files.readDefinition(wid, did));
    validateForRun(def);
    loaded.set(key, def);
    for (const node of def.nodes) {
      if (node.kind !== 'call') continue;
      const c = node.call!;
      const work = await files.select(c.workId, (work) => ({
        ownerItemId: work.ownerItemId,
      }));
      if (work.ownerItemId && work.ownerItemId !== itemId)
        throw Error(
          `方法「${node.label}」属于其他工作项，不能作为共享方法调用。`,
        );
      const targetKey = JSON.stringify([c.workId, c.definitionId]);
      const target =
        loaded.get(targetKey) ??
        (await files.readDefinition(c.workId, c.definitionId));
      if (
        JSON.stringify(c.inputNames) !== JSON.stringify(target.inputs) ||
        JSON.stringify(c.outputNames) !==
          JSON.stringify(Object.keys(target.outputs))
      )
        throw Error(
          `方法「${node.label}」的输入输出端口与固定版本接口不一致。`,
        );
      await visit(c.workId, c.definitionId, target, [...path, key]);
    }
    checked.add(key);
  };
  await visit(workId, definitionId, definition, ancestors);
}
