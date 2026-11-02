import { MaterialCard } from '../../components/MaterialCard';
import type { NodeResult } from '../../../shared/records';
import { DeferredDetails } from '../../components/DeferredContent';
import { Button } from '../../components/ui/button';
import { short } from '../../core/format';
import { ArtifactPreview } from './ArtifactPreview';
import {
  executionDefinition,
  resultSources,
  type RunFocus,
  type RunSnapshot,
} from './run-inspector-model';

export function RunSources({
  result,
  snapshots,
  onNavigate,
  onMaterial,
  materials,
}: {
  result: NodeResult;
  snapshots: Record<string, RunSnapshot>;
  onNavigate: (source: RunFocus) => void;
  onMaterial: (id: string) => void;
  materials: import('../../../shared/records').WorkItemView['materials'];
}) {
  const sources = resultSources(result);
  function find(id: string) {
    for (const snapshot of Object.values(snapshots)) {
      for (const run of snapshot.work.runs) {
        const entry = run.results.find((candidate) => candidate.id === id);
        if (!entry) continue;
        const siblings = run.results.filter(
          (candidate) => candidate.nodeId === entry.nodeId,
        );
        return {
          group: JSON.stringify([snapshot.work.id, run.id, entry.nodeId]),
          label:
            executionDefinition(run, snapshot.definitions)?.nodes.find(
              (node) => node.id === entry.nodeId,
            )?.label || entry.nodeId,
          number: siblings.findIndex((candidate) => candidate.id === id) + 1,
          total: siblings.length,
          result: entry,
          focus: {
            workId: snapshot.work.id,
            runId: run.id,
            definitionId: run.definitionId,
            nodeId: entry.nodeId,
            resultId: id,
          } satisfies RunFocus,
        };
      }
    }
  }
  type Source = NonNullable<ReturnType<typeof find>>;
  const groups = new Map<string, Source[]>();
  const missing: string[] = [];
  for (const id of sources.results) {
    const source = find(id);
    if (!source) {
      missing.push(id);
      continue;
    }
    const group = groups.get(source.group) || [];
    group.push(source);
    groups.set(source.group, group);
  }
  const link = (source: Source) => (
    <Button
      variant="outline"
      size="sm"
      key={source.result.id}
      onClick={() => onNavigate(source.focus)}
    >
      上游 · {source.label}
      {source.total > 1 ? ` · 第 ${source.number} 项` : ''}
    </Button>
  );
  const materialCards = () => (
    <div className="material-cards">
      {sources.materials.map((id) => {
        const material = materials.find((entry) => entry.id === id);
        return material ? (
          <MaterialCard
            key={id}
            material={material}
            onOpen={() => onMaterial(id)}
          />
        ) : (
          <p key={id}>材料 {id} 当前不可用</p>
        );
      })}
    </div>
  );
  return (
    <div className="run-sources">
      {[...groups.entries()].map(([key, entries]) =>
        entries.length > 4 ? (
          <DeferredDetails
            key={key}
            className="item-tool-record"
            summary={`上游 · ${entries[0].label} · ${entries.length} 个实例`}
          >
            {() => (
              <ol className="run-source-instances">
                {entries.map((entry) => (
                  <li key={entry.result.id}>
                    {link(entry)}
                    <ArtifactPreview
                      value={
                        Object.values(entry.result.outputs).flat()[0]?.value ??
                        Object.values(entry.result.input).flat()[0]?.value ??
                        null
                      }
                    />
                  </li>
                ))}
              </ol>
            )}
          </DeferredDetails>
        ) : (
          <div key={key} className="item-source-links">
            {entries.map(link)}
          </div>
        ),
      )}
      {missing.map((id) => (
        <p key={id} className="meta-text">
          来源结果不可用 · {short(id)}
        </p>
      ))}
      {sources.materials.length > 4 ? (
        <DeferredDetails
          className="item-tool-record"
          summary={`关联原始材料 · ${sources.materials.length} 项`}
        >
          {materialCards}
        </DeferredDetails>
      ) : (
        materialCards()
      )}
    </div>
  );
}
