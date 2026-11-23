import type {
  Definition,
  NodeResult,
  Run,
  Json,
  Snapshot,
} from '../../../shared/records';
import { materializeDefinition } from '../../../shared/expansion';
import { isFinalOutput } from '../../core/definition';

export type RunFocus = {
  workId: string;
  runId: string;
  definitionId: string;
  nodeId?: string;
  instanceId?: string;
  resultId?: string;
  port?: string;
  index?: number;
};
export function executionDefinition(
  run: Run,
  definitions: Record<string, Definition>,
) {
  const original = definitions[run.definitionId];
  return original && materializeDefinition(original, run.expansions || []);
}
export function initialNode(run: Run, definition?: Definition) {
  const completed = run.results.filter(
    (result) =>
      result.status === 'completed' && !result.purpose && !result.intermediate,
  );
  return (
    completed.find((result) => isFinalOutput(definition, result.nodeId))
      ?.nodeId ||
    completed.at(-1)?.nodeId ||
    Object.keys(run.nodeStates).find(
      (id) =>
        run.nodeStates[id] === 'running' || run.nodeStates[id] === 'waiting',
    ) ||
    (typeof run.scope === 'object' ? run.scope.nodeId : undefined) ||
    Object.keys(run.nodeStates)[0] ||
    definition?.nodes[0]?.id
  );
}
export function focusedResult(
  run: Run,
  focus: RunFocus,
  nodeId?: string,
): NodeResult | undefined {
  if (focus.resultId)
    return run.results.find((result) => result.id === focus.resultId);
  if (focus.instanceId)
    return run.results.find(
      (result) =>
        result.nodeId === nodeId && result.instanceId === focus.instanceId,
    );
  return (
    [...run.results]
      .reverse()
      .find(
        (result) =>
          result.nodeId === nodeId && !result.intermediate && !result.purpose,
      ) || run.results.find((result) => result.nodeId === nodeId)
  );
}
export function resultSources(result: NodeResult) {
  const items = Object.values(result.input).flat();
  return {
    results: [...new Set(items.flatMap((item) => item.sourceResultIds))],
    materials: [...new Set(items.flatMap((item) => item.materialIds))],
  };
}

export type RunSnapshot = Pick<Snapshot, 'work' | 'definitions'>;
export type InspectedArtifact = {
  source: RunFocus;
  label: string;
  value: Json;
};
