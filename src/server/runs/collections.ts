import type {
  FlowNode,
  InputItem,
  Inputs,
  Json,
} from '../../shared/records.ts';
import { nodeInputPorts } from '../../shared/node-ports.ts';

export interface CollectionValue {
  value: Json;
  sources: InputItem[];
  sampleId?: string;
}
export function namedValues(node: FlowNode, input: Inputs): Json {
  return Object.fromEntries(
    nodeInputPorts(node).map((port) => [
      port,
      input[port].map((item) => item.value),
    ]),
  );
}
function keyOf(
  item: InputItem,
  path: (string | number)[],
  port: string,
  index: number,
): string {
  let value: Json = item.value;
  for (const segment of path) {
    if (
      value === null ||
      typeof value !== 'object' ||
      !Object.hasOwn(value, segment)
    )
      throw Error(
        `join ${port}[${index}] 键路径 ${JSON.stringify(path)} 缺失。`,
      );
    value = (value as Record<string | number, Json>)[segment];
  }
  if (
    !['string', 'number', 'boolean'].includes(typeof value) ||
    (typeof value === 'number' && !Number.isFinite(value))
  )
    throw Error(
      `join ${port}[${index}] 键必须是字符串、有限数字或布尔值，不能是 null、对象或数组。`,
    );
  return JSON.stringify([typeof value, value]);
}
export function executeCollection(
  node: FlowNode,
  input: Inputs,
): CollectionValue[] {
  const ports = nodeInputPorts(node);
  if (node.functionName === 'merge')
    return ports.flatMap((port) =>
      input[port].map((item) => ({
        value: item.value,
        sources: [item],
        sampleId: item.sampleId,
      })),
    );
  if (node.functionName === 'collect')
    return [
      {
        value: namedValues(node, input),
        sources: ports.flatMap((port) => input[port]),
      },
    ];
  const config = node.join!,
    left = input.left,
    right = input.right;
  const keys = (rows: InputItem[], path: (string | number)[], port: string) => {
    const seen = new Set<string>();
    return rows.map((row, index) => {
      const key = keyOf(row, path, port, index);
      if (config.duplicates === 'error' && seen.has(key))
        throw Error(
          `join ${port}[${index}] 出现重复键；请调整键或选择全部配对。`,
        );
      seen.add(key);
      return key;
    });
  };
  const leftKeys = keys(left, config.leftKey, 'left'),
    rightKeys = keys(right, config.rightKey, 'right');
  const indexed = new Map<string, number[]>();
  rightKeys.forEach((key, index) => {
    const group = indexed.get(key);
    if (group) group.push(index);
    else indexed.set(key, [index]);
  });
  const matched = new Set<number>(),
    rows: CollectionValue[] = [];
  left.forEach((item, index) => {
    const matches = indexed.get(leftKeys[index]) ?? [];
    if (matches.length)
      for (const other of matches) {
        matched.add(other);
        rows.push({
          value: { left: item.value, right: right[other].value },
          sources: [item, right[other]],
        });
      }
    else if (config.type === 'left' || config.type === 'full')
      rows.push({ value: { left: item.value, right: null }, sources: [item] });
  });
  if (config.type === 'right' || config.type === 'full')
    right.forEach((item, index) => {
      if (!matched.has(index))
        rows.push({
          value: { left: null, right: item.value },
          sources: [item],
        });
    });
  return rows;
}
