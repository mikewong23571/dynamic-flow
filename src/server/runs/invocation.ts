import type { FlowNode, Inputs, Json } from '../../shared/records.ts';
import { collectionFunction, nodeOperation } from '../../shared/node-ports.ts';
import { namedValues } from './collections.ts';

/** The checker and runtime must use the same item/batch unit. No node executes here. */
export function invocationBatches(node: FlowNode, input: Inputs): Inputs[] {
  const operation = nodeOperation(node);
  if (operation === 'aggregate') return [input];
  const port = node.kind === 'call' ? node.call!.eachPort! : 'input';
  return input[port].map((item) =>
    node.kind === 'call'
      ? structuredClone({ ...input, [port]: [item] })
      : { input: [item] },
  );
}
export function invocationValue(node: FlowNode, input: Inputs): Json {
  if (collectionFunction(node) || node.kind === 'call')
    return namedValues(node, input);
  const values = Object.values(input)
    .flat()
    .map((item) => item.value);
  const operation = nodeOperation(node);
  return operation === 'aggregate' ? values : values[0];
}
