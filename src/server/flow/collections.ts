import type { FlowNode, Json } from '../../shared/records.ts';
import { collectionFunction } from '../../shared/node-ports.ts';
import { incompatibleTypes } from './schema.ts';

export function checkCollection(
  node: FlowNode,
): { field: string; message: string }[] {
  const issues: { field: string; message: string }[] = [];
  const add = (field: string, message: string) =>
    issues.push({ field, message });
  if (
    node.inputNames !== undefined &&
    (node.kind !== 'function' ||
      !['merge', 'collect'].includes(node.functionName ?? ''))
  )
    add('inputNames', '具名输入仅用于 merge 和 collect。');
  if (
    node.join !== undefined &&
    (node.kind !== 'function' || node.functionName !== 'join')
  )
    add('join', '关联配置仅用于 join。');
  if (!collectionFunction(node)) return issues;
  if (node.mode !== 'all') add('mode', '集合函数需要 all 模式。');
  if (node.operation !== undefined && node.operation !== 'aggregate')
    add('operation', '集合函数只支持 aggregate。');
  if (node.functionName !== 'join') {
    const names = node.inputNames;
    if (
      !Array.isArray(names) ||
      names.length < 2 ||
      names.some(
        (name) =>
          typeof name !== 'string' || !name.trim() || name !== name.trim(),
      ) ||
      new Set(names).size !== names.length
    )
      add(
        'inputNames',
        '请设置至少两个不重复的非空输入名称，名称首尾不能有空格。',
      );
  } else {
    const config = node.join;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      add('join', '请配置关联类型、左右键路径和重复键策略。');
    } else {
      if (!['inner', 'left', 'right', 'full'].includes(config.type))
        add('join.type', '关联类型应为 inner、left、right 或 full。');
      if (!['all', 'error'].includes(config.duplicates))
        add('join.duplicates', '重复键策略应为 all 或 error。');
      for (const key of ['leftKey', 'rightKey'] as const)
        if (
          !Array.isArray(config[key]) ||
          config[key].some(
            (part) =>
              typeof part !== 'string' &&
              !(
                typeof part === 'number' &&
                Number.isInteger(part) &&
                part >= 0
              ),
          )
        )
          add(
            `join.${key}`,
            '键路径需要字段名或非负整数索引数组；空数组表示整个值。',
          );
    }
  }
  if (
    node.inputSchema !== undefined &&
    incompatibleTypes({ type: 'object' }, node.inputSchema)
  )
    add('inputSchema', '集合函数的输入 Schema 应约束具名数组对象。');
  if (
    node.expectedOutput !== undefined &&
    incompatibleTypes(
      { type: node.functionName === 'collect' ? 'object' : 'array' },
      node.expectedOutput,
    )
  )
    add(
      'expectedOutput',
      node.functionName === 'collect'
        ? 'collect 输出 Schema 应约束具名数组对象。'
        : 'merge / join 输出 Schema 应约束整批数组。',
    );
  return issues;
}

/** Each collection input is an array; compare this port, not the entire object. */
export function collectionPortSchema(schema: Json, port: string): Json {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema))
    return true;
  const properties = schema.properties;
  if (
    !properties ||
    typeof properties !== 'object' ||
    Array.isArray(properties)
  )
    return true;
  return Object.hasOwn(properties, port) ? properties[port] : true;
}
