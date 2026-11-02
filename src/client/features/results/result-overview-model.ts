import type {
  Definition,
  Json,
  NodeResult,
  Run,
  Work,
  WorkItemView,
} from '../../../shared/records';
import { executionDefinition, type RunFocus } from './run-inspector-model';
import { dateTime, portLabel } from '../../core/format';
export type BusinessItem = Pick<
  WorkItemView,
  'id' | 'key' | 'title' | 'status' | 'effectiveStatus' | 'runs'
>;
export type RunRow = {
  run: Run;
  item?: BusinessItem;
  relatedTitle?: string;
  key?: string;
};
export type FinalArtifact = {
  id: string;
  run: Run;
  result: NodeResult;
  port: string;
  index: number;
  value: Json;
  contentUrl?: string;
  title: string;
  groupId: string;
  groupTitle: string;
  itemLabel: string;
  step: string;
  source: string;
  focus: RunFocus;
};
export function standaloneLabel(run: Run) {
  return typeof run.scope === 'object' || !!run.comparisonId
    ? '试运行'
    : '独立运行';
}
export function runLabel(run: Run, item?: BusinessItem) {
  const index = item?.runs.findIndex((ref) => ref.runId === run.id) ?? -1;
  return index >= 0
    ? `第 ${index + 1} 次推进`
    : `${run.workItem ? '运行' : standaloneLabel(run)} · ${dateTime(run.startedAt)}`;
}
export function runRows(work: Work, items: BusinessItem[]): RunRow[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return work.runs.map((run) => {
    const item = run.workItem ? byId.get(run.workItem.id) : undefined;
    return {
      run,
      item,
      relatedTitle: item?.title || run.workItem?.title,
      key: item?.key || run.workItem?.key,
    };
  });
}
export function finalArtifacts(
  work: Work,
  definitions: Record<string, Definition>,
): FinalArtifact[] {
  const artifacts: FinalArtifact[] = work.runs.flatMap((run) => {
    const definition = executionDefinition(run, definitions);
    return run.results
      .filter(
        (result) =>
          result.status === 'completed' &&
          !result.purpose &&
          !result.intermediate,
      )
      .flatMap((result) =>
        Object.entries(result.outputs).flatMap(([port, outputs]) => {
          const names = Object.entries(definition?.outputs || {})
            .filter(
              ([, target]) => target[0] === result.nodeId && target[1] === port,
            )
            .map(([name]) => name);
          if (!names.length) return [];
          const step =
            definition?.nodes.find((node) => node.id === result.nodeId)
              ?.label || result.nodeId;
          const readableNames = names
            .map((name) => portLabel(name))
            .filter(
              (name, index) =>
                name !== names[index] || !/^[A-Za-z0-9_-]+$/.test(name),
            );
          const ports = new Set(
            Object.values(definition?.outputs || {})
              .filter(([nodeId]) => nodeId === result.nodeId)
              .map(([, outputPort]) => outputPort),
          );
          const groupTitle = readableNames.length
            ? readableNames.join(' / ')
            : `${step}${ports.size > 1 ? ` · ${names.join(' / ')}` : ''}`;
          return outputs.map((output, index) => ({
            id: `${result.id}:${port}:${index}`,
            run,
            result,
            port,
            index,
            value: output.value,
            contentUrl: output.contentUrl,
            title: groupTitle,
            groupTitle,
            groupId: JSON.stringify([run.id, result.nodeId, port]),
            itemLabel: '',
            step,
            source: run.workItem?.title || standaloneLabel(run),
            focus: {
              workId: work.id,
              runId: run.id,
              definitionId: run.definitionId,
              nodeId: result.nodeId,
              resultId: result.id,
              instanceId: result.instanceId,
            },
          }));
        }),
      );
  });
  for (const group of artifactGroups(artifacts)) {
    group.items.forEach((item, index) => {
      item.itemLabel = `第 ${index + 1} 项`;
      item.title =
        group.items.length > 1
          ? `${group.title} · ${item.itemLabel}`
          : group.title;
    });
  }
  return artifacts;
}

export type ArtifactGroup = {
  id: string;
  title: string;
  run: Run;
  port: string;
  step: string;
  source: string;
  items: FinalArtifact[];
};
export function artifactGroups(artifacts: FinalArtifact[]): ArtifactGroup[] {
  const groups = new Map<string, ArtifactGroup>();
  for (const item of artifacts) {
    const group = groups.get(item.groupId);
    if (group) group.items.push(item);
    else
      groups.set(item.groupId, {
        id: item.groupId,
        title: item.groupTitle,
        run: item.run,
        port: item.port,
        step: item.step,
        source: item.source,
        items: [item],
      });
  }
  return [...groups.values()];
}

/** Preview actual scalar fields without inferring business identity or parsing JSON strings. */
export function artifactPreview(
  value: Json,
): { label: string; text: string; full: string }[] {
  const preview = (label: string, field: Json) => {
    const full = String(field);
    return { label, text: full.replace(/\s+/g, ' ').slice(0, 160), full };
  };
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value)
      .filter(([, field]) => field === null || typeof field !== 'object')
      .slice(0, 6)
      .map(([label, field]) => preview(label, field));
  }
  return value === null || typeof value !== 'object'
    ? [preview('', value)]
    : [];
}
