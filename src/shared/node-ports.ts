import type { FlowNode } from './records.js';

/** These functions share actual port semantics across the canvas and execution. */
export function collectionFunction(node: FlowNode): boolean {
  return (
    node.kind === 'function' &&
    (node.functionName === 'collect' ||
      node.functionName === 'join' ||
      (node.functionName === 'merge' && node.inputNames !== undefined))
  );
}
export function nodeInputPorts(node: FlowNode): string[] {
  if (node.kind !== 'function') return ['input'];
  if (node.functionName === 'join') return ['left', 'right'];
  if (node.functionName === 'collect') return node.inputNames ?? [];
  if (node.functionName === 'merge')
    return node.inputNames ?? ['left', 'right'];
  return ['input'];
}
export function expandedCollectionOutput(node: FlowNode): boolean {
  return collectionFunction(node) && node.functionName !== 'collect';
}
