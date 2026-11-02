import { nodeInputPorts as inputPorts } from '../../shared/node-ports';
import type { FlowNode, Inputs, Work } from '../../shared/records';

export {
  nodeInputPorts as inputPorts,
  nodeOutputPorts as outputPorts,
} from '../../shared/node-ports';

export const materialInputs = (
  work: Work,
  ids: string[],
  port = 'input',
): Inputs => ({
  [port]: work.materials
    .filter((m) => ids.includes(m.id))
    .map((m) => ({
      sampleId: m.id,
      value: m.text,
      materialIds: [m.id],
      sourceResultIds: [],
    })),
});
export function localInputs(
  node: FlowNode | undefined,
  items: Inputs,
  port: string,
): Inputs {
  const ports = node ? inputPorts(node) : [port];
  return Object.fromEntries(
    ports.map((p) => [p, p === port ? Object.values(items).flat() : []]),
  );
}
