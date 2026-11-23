import type { FlowNode, Json } from './records.js';

/** Shared shapes for author tools; semantic checks additionally resolve fixed methods. */
const portNamesSchema = {
  type: 'array',
  minItems: 1,
  uniqueItems: true,
  items: { type: 'string', pattern: '^\\S(?:.*\\S)?$' },
};
export const callConfigSchema: Json = {
  type: 'object',
  additionalProperties: false,
  required: ['workId', 'definitionId', 'inputNames', 'outputNames'],
  properties: {
    workId: { type: 'string', minLength: 1 },
    definitionId: { type: 'string', minLength: 1 },
    inputNames: portNamesSchema,
    outputNames: portNamesSchema,
    eachPort: { type: 'string', minLength: 1 },
  },
};
export const groupByConfigSchema: Json = {
  type: 'object',
  additionalProperties: false,
  required: ['keys'],
  properties: {
    keys: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'array',
        items: { anyOf: [{ type: 'string' }, { type: 'integer', minimum: 0 }] },
      },
    },
  },
};

/** These functions share actual port semantics across the canvas and execution. */
export function collectionFunction(node: FlowNode): boolean {
  return (
    node.kind === 'function' &&
    (node.functionName === 'collect' ||
      node.functionName === 'groupBy' ||
      node.functionName === 'join' ||
      node.functionName === 'merge')
  );
}
export function nodeInputPorts(node: FlowNode): string[] {
  if (node.kind === 'file') return [];
  if (node.kind === 'call')
    return Array.isArray(node.call?.inputNames) ? node.call.inputNames : [];
  if (node.kind !== 'function') return ['input'];
  if (node.functionName === 'join') return ['left', 'right'];
  if (node.functionName === 'collect') return node.inputNames ?? [];
  if (node.functionName === 'merge') return node.inputNames ?? [];
  return ['input'];
}
export function nodeOutputPorts(node: FlowNode): string[] {
  if (node.kind === 'call')
    return Array.isArray(node.call?.outputNames) ? node.call.outputNames : [];
  return node.kind === 'branch'
    ? ['matched', 'unmatched']
    : node.kind === 'wait'
      ? ['output', 'event']
      : ['output'];
}
export function expandedCollectionOutput(node: FlowNode): boolean {
  return collectionFunction(node) && node.functionName !== 'collect';
}

/** The calculation unit is explicit for computational nodes and fixed for control/collection nodes. */
export function nodeOperation(
  node: FlowNode,
): NonNullable<FlowNode['operation']> {
  if (
    node.kind === 'call' ||
    node.kind === 'agent' ||
    (node.kind === 'function' && !collectionFunction(node))
  )
    return node.operation!;
  return 'aggregate';
}
