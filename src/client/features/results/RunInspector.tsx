import { api } from '../../core/api';
import { errorText } from '../../core/format';
import { useEffect, useState, type ReactNode } from 'react';
import type { NodeResult, Run } from '../../../shared/records';
import { Button } from '../../components/ui';
import { RunGroupNavigation, RunInstancePicker } from './RunSelection';
import { dateTime, short, workTitle } from '../../core/format';
import { isFinalOutput } from '../../core/definition';
import { RunArtifact } from './RunArtifact';
import {
  executionDefinition,
  focusedResult,
  initialNode,
  type RunFocus,
  type RunSnapshot,
  type InspectedArtifact,
} from './run-inspector-model';
import './RunInspector.css';

/** Inspect one fixed run. Business/method actions belong to the surrounding workspace. */
export function RunInspector({
  snapshots: providedSnapshots,
  focus,
  onFocus,
  onMaterial,
  actions,
  runLabel,
  showIdentity = true,
  rootFocus,
}: {
  showIdentity?: boolean;
  rootFocus?: RunFocus;
  snapshots: Record<string, RunSnapshot>;
  focus: RunFocus;
  onFocus: (focus: RunFocus) => void;
  onMaterial?: (id: string) => void;
  actions?: (
    artifact: InspectedArtifact,
    result: NodeResult,
    run: Run,
  ) => ReactNode;
  runLabel?: (focus: RunFocus) => string;
}) {
  const [sourceSnapshots, setSourceSnapshots] = useState<
    Record<string, RunSnapshot>
  >({});
  const [sourceError, setSourceError] = useState('');
  const [sourceRetry, setSourceRetry] = useState(0);
  const snapshots = { ...providedSnapshots };
  for (const [id, loaded] of Object.entries(sourceSnapshots)) {
    const provided = providedSnapshots[id];
    snapshots[id] = provided
      ? {
          ...provided,
          definitions: { ...provided.definitions, ...loaded.definitions },
          work: {
            ...provided.work,
            runs: [
              ...loaded.work.runs.filter(
                (r) => !provided.work.runs.some((l) => l.id === r.id),
              ),
              ...provided.work.runs,
            ],
          },
        }
      : loaded;
  }
  const [trail, setTrail] = useState<RunFocus[]>([]);
  const snapshot = snapshots[focus.workId];
  const run = snapshot?.work.runs.find((run) => run.id === focus.runId);
  useEffect(() => {
    if (run) {
      setSourceError('');
      return;
    }
    let live = true;
    void api<RunSnapshot>(`/api/works/${focus.workId}?runIds=${focus.runId}`)
      .then((loaded) => {
        if (live) {
          setSourceSnapshots({ [focus.workId]: loaded });
          setSourceError('');
        }
      })
      .catch((reason) => {
        if (live) setSourceError(errorText(reason));
      });
    return () => {
      live = false;
    };
  }, [focus.workId, focus.runId, !!run, sourceRetry]);
  useEffect(() => {
    if (
      providedSnapshots[focus.workId]?.work.runs.some(
        (r) => r.id === focus.runId,
      ) ||
      !run ||
      !['queued', 'running', 'stopping'].includes(run.status)
    )
      return;
    let live = true;
    const timer = setTimeout(() => {
      void api<RunSnapshot>(`/api/works/${focus.workId}?runIds=${focus.runId}`)
        .then((next) => {
          if (live) setSourceSnapshots({ [focus.workId]: next });
        })
        .catch((reason) => {
          if (live) setSourceError(errorText(reason));
        });
    }, 1200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [providedSnapshots, focus.workId, focus.runId, run]);
  const definition =
    run && snapshot && executionDefinition(run, snapshot.definitions);
  const participating = new Set([
    ...(run ? Object.keys(run.nodeStates) : []),
    ...(run?.results.map((result) => result.nodeId) || []),
  ]);
  const nodeId = focus.nodeId || (run && initialNode(run, definition));
  const node = definition?.nodes.find((node) => node.id === nodeId);
  const result = run && focusedResult(run, focus, nodeId);
  const source = {
    ...focus,
    nodeId,
    ...(result && { resultId: result.id, instanceId: result.instanceId }),
  };
  function navigate(next: RunFocus) {
    if (source.resultId) setTrail((previous) => [...previous, source]);
    onFocus(next);
  }
  const instances =
    run?.results.filter((candidate) => candidate.nodeId === nodeId) || [];
  return (
    <div className="run-inspector" data-run-id={focus.runId}>
      {sourceError && (
        <p role="alert" className="error-banner">
          来源读取失败：{sourceError}{' '}
          <Button onClick={() => setSourceRetry((value) => value + 1)}>
            重新读取来源
          </Button>
        </p>
      )}
      {(trail.length > 0 ||
        (rootFocus &&
          (rootFocus.workId !== focus.workId ||
            rootFocus.runId !== focus.runId))) && (
        <nav className="run-source-trail" aria-label="来源轨迹">
          {(trail.length ? trail : [rootFocus!]).map((entry, index) => (
            <Button
              key={`${entry.workId}:${entry.runId}:${index}`}
              variant="ghost"
              onClick={() => {
                onFocus(entry);
                setTrail((old) => old.slice(0, index));
              }}
            >
              {snapshots[entry.workId]
                ? workTitle(snapshots[entry.workId].work)
                : '来源方法'}{' '}
              · {short(entry.runId)}
              {entry.nodeId &&
                ` · ${snapshots[entry.workId]?.definitions[entry.definitionId]?.nodes.find((node) => node.id === entry.nodeId)?.label || entry.nodeId}`}
            </Button>
          ))}
          <span aria-current="location">当前来源</span>
        </nav>
      )}
      {!run && <p role="alert">找不到这轮执行，原运行可能已不可用。</p>}
      {run && (
        <>
          <RunGroupNavigation
            items={(definition?.nodes || [])
              .filter((step) => participating.has(step.id))
              .map((step) => ({
                id: step.id,
                label: step.label,
                status: run.nodeStates[step.id] || 'queued',
              }))}
            selectedId={nodeId}
            onSelect={(selected) =>
              onFocus({
                workId: focus.workId,
                runId: run.id,
                definitionId: run.definitionId,
                nodeId: selected,
              })
            }
          />
          {showIdentity && (
            <div className="run-inspection-identity">
              <strong>
                {snapshot ? workTitle(snapshot.work) : '来源方法'}
              </strong>
              <span>
                执行 {short(run.id)} · 固定版本 {short(run.definitionId)}
              </span>
              {run.workItem && <span>所属工作项 · {run.workItem.title}</span>}
            </div>
          )}
          {!definition && (
            <p role="alert">这轮执行的固定定义不可用，未替换为当前草稿。</p>
          )}
          {nodeId && !node && <p role="alert">这轮固定定义中没有所选环节。</p>}
          <RunInstancePicker
            items={instances.map((candidate, index) => ({
              id: candidate.id,
              resultId: candidate.id,
              label: `第 ${index + 1} 项`,
              status: candidate.status,
              value:
                Object.values(candidate.outputs).flat()[0]?.value ??
                Object.values(candidate.input).flat()[0]?.value,
              iteration: candidate.iteration,
              purpose: candidate.purpose,
              intermediate: candidate.intermediate,
            }))}
            selectedId={result?.id}
            onSelect={(resultId) =>
              onFocus({ ...focus, nodeId, resultId, instanceId: undefined })
            }
          />
          {!result && (
            <>
              <h3>{node?.label || nodeId || '尚无环节'}</h3>
              <p className="muted">
                {focus.resultId || focus.instanceId
                  ? '找不到指定的执行实例，未替换为其他结果。'
                  : !participating.has(nodeId || '')
                    ? '此环节未参与本次运行。'
                    : `此环节${run.nodeStates[nodeId || ''] === 'blocked' ? '因上游失败而阻断' : '尚未产生执行结果'}。`}
              </p>
            </>
          )}
        </>
      )}
      {[...(source.resultId ? [source] : [])].map((ref) => {
        const saved = snapshots[ref.workId];
        const execution = saved?.work.runs.find((run) => run.id === ref.runId);
        const output = execution?.results.find(
          (result) => result.id === ref.resultId,
        );
        if (!saved || !execution || !output) return null;
        const def = executionDefinition(execution, saved.definitions);
        const heading =
          def?.nodes.find((node) => node.id === output.nodeId)?.label ||
          output.nodeId;
        const siblingInstances = execution.results.filter(
          (candidate) => candidate.nodeId === output.nodeId,
        );
        const instanceLabel =
          siblingInstances.length > 1
            ? ` · 第 ${siblingInstances.findIndex((candidate) => candidate.id === output.id) + 1} 项`
            : '';
        const artifact: InspectedArtifact = {
          source: ref,
          label: `${workTitle(saved.work)} · ${runLabel?.(ref) || dateTime(execution.startedAt)} · ${heading}${instanceLabel}`,
          value: Object.fromEntries(
            Object.entries(output.outputs).map(([port, items]) => [
              port,
              items.map((item) => item.value),
            ]),
          ),
        };
        const invalidOutput =
          (ref.index !== undefined && ref.port === undefined) ||
          (ref.port !== undefined &&
            (!output.outputs[ref.port] ||
              (ref.index !== undefined &&
                !output.outputs[ref.port][ref.index])));
        if (invalidOutput)
          return ref.resultId === result?.id ? (
            <p key={ref.resultId} role="alert">
              指定端口或产物索引不可用，未替换为其它产物。
            </p>
          ) : null;
        return (
          <div
            className={`item-retained-artifact ${isFinalOutput(def, output.nodeId) && !output.purpose && !output.intermediate ? 'final-result' : ''}`}
            hidden={result?.id !== ref.resultId}
            key={ref.resultId}
            data-result-id={ref.resultId}
          >
            <RunArtifact
              heading={heading}
              snapshots={snapshots}
              run={execution}
              result={output}
              artifact={artifact}
              onNavigate={navigate}
              onMaterial={onMaterial}
              actions={actions?.(artifact, output, execution)}
            />
          </div>
        );
      })}
    </div>
  );
}
