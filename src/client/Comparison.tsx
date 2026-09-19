import type {
  Comparison as ComparisonRecord,
  Definition,
  Inputs,
  NodeResult,
  Work,
} from '../shared/records';
import { active, changeSummary, comparisonStale, short } from './model';
import { Badge, Button, Empty } from './components/ui';
import { Value } from './Results';
function output(result: NodeResult | undefined) {
  if (!result) return <span className="muted">等待结果</span>;
  return (
    <>
      <Badge status={result.status} />
      {result.error && <p className="inline-error">{result.error}</p>}
      {Object.values(result.outputs)
        .flat()
        .map((item, i) => (
          <Value key={i} value={item.value} />
        ))}
    </>
  );
}
export function Comparison({
  work,
  definitions,
  comparison,
  inputs,
  hasUnsavedChanges = false,
  onAction,
}: {
  work: Work;
  definitions: Record<string, Definition>;
  comparison?: ComparisonRecord;
  inputs: Inputs;
  hasUnsavedChanges?: boolean;
  onAction: (a: string, f?: Record<string, unknown>) => Promise<unknown>;
}) {
  if (!comparison)
    return (
      <Empty title="用同一组输入比较做法">
        <p>选择一个节点和少量样本，再点击「比较当前与候选」。</p>
      </Empty>
    );
  const baseline = work.runs.find((r) => r.id === comparison.baselineRunId);
  const candidate = work.runs.find((r) => r.id === comparison.candidateRunId);
  const stale = comparisonStale(
    comparison,
    work.draftId,
    inputs,
    hasUnsavedChanges,
  );
  const items = Object.values(comparison.frozenInputs).flat();
  const ids = [...new Set(items.map((i) => i.sampleId))];
  const find = (results: NodeResult[] | undefined, id: string) =>
    results?.find((r) =>
      Object.values(r.input)
        .flat()
        .some((i) => i.sampleId === id),
    );
  return (
    <div className="comparison-view scroll">
      <div className="section-heading">
        <div>
          <h2>同输入比较</h2>
          <p className="muted">
            {
              definitions[comparison.candidateId]?.nodes.find(
                (n) => n.id === comparison.nodeId,
              )?.label
            }{' '}
            · {ids.length} 条固定输入
          </p>
        </div>
        <Badge status={comparison.status} />
        {active(comparison.status) && (
          <Button
            onClick={() =>
              void onAction('stopComparison', { comparisonId: comparison.id })
            }
          >
            停止比较
          </Button>
        )}
      </div>
      {stale && (
        <p className="notice">
          {hasUnsavedChanges
            ? '需重新试运行：你有未保存的改动。先保存修改，再用当前做法试验；以下保留原比较。'
            : '需重新试运行：候选做法或当前选择的输入已变化。以下保留原比较。'}
        </p>
      )}
      {comparison.error && <p className="inline-error">{comparison.error}</p>}
      <div className="change-summary">
        {changeSummary(
          definitions[comparison.baselineId],
          definitions[comparison.candidateId],
        ).map((x) => (
          <span key={x}>{x}</span>
        ))}
      </div>
      <div className="compare-head">
        <span>样本</span>
        <strong>
          当前做法 <small>{short(comparison.baselineId)}</small>
        </strong>
        <strong>
          候选做法 <small>{short(comparison.candidateId)}</small>
        </strong>
      </div>
      {ids.map((id) => (
        <div className="compare-row" key={id}>
          <div>
            <span className="sample-id">{id}</span>
            <Value value={items.find((i) => i.sampleId === id)!.value} />
          </div>
          <div>{output(find(baseline?.results, id))}</div>
          <div>{output(find(candidate?.results, id))}</div>
        </div>
      ))}
    </div>
  );
}
