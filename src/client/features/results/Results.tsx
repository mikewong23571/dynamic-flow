import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import type { WorkItemSummaryPage } from '../../../shared/records';
import type { ResultView } from '../../app/navigation';
import { routeHref } from '../../app/navigation';
import { ObjectLink } from '../../components/ObjectLink';
import { api } from '../../core/api';
import {
  active as running,
  errorText,
  short,
  statusNames,
} from '../../core/format';
import { Button } from '../../components/ui';
import { NativeSelect } from '../../components/ui/native-select';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '../../components/ui/tabs';
import { DeferredContent } from '../../components/DeferredContent';
import { RunArtifactsPage } from './RunArtifactsPage';
import { RunProcess } from './RunProcess';
import { ResultsOverview, type OverviewMode } from './ResultsOverview';
import {
  finalArtifacts,
  runRows,
  runLabel,
  type BusinessItem,
  type FinalArtifact,
} from './result-overview-model';
import { executionDefinition, type RunFocus } from './run-inspector-model';
import './ResultsOverview.css';
export { InputContent, Value } from './RunProcess';

export function Results(
  props: ComponentProps<typeof RunProcess> & {
    active?: boolean;
    view?: ResultView;
    requestedRunId?: string;
    onViewChange: (view: ResultView, runId?: string) => void;
    onOpenItem: (id: string) => void;
  },
) {
  const { work, definitions, requestedFocus, active = true } = props;
  const view = props.view || (props.requestedRunId ? 'process' : 'overview');
  const [items, setItems] = useState<BusinessItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [mode, setMode] = useState<OverviewMode>('runs');
  const [artifactRequests, setArtifactRequests] = useState<
    Record<string, { groupId?: string; artifactId?: string }>
  >({});
  const [processFocus, setProcessFocus] = useState<Record<string, RunFocus>>(
    {},
  );
  const [visitedArtifactRuns, setVisitedArtifactRuns] = useState<string[]>([]);
  const selectedId = props.requestedRunId || props.selectedRun;
  const selected = work.runs.find((run) => run.id === selectedId);
  const missingRun = !!selectedId && !selected;
  useEffect(() => {
    if (view === 'artifacts' && selected)
      setVisitedArtifactRuns((old) =>
        old.includes(selected.id) ? old : [...old, selected.id],
      );
  }, [view, selected?.id]);
  useEffect(() => {
    if (!active) return;
    if (!work.runs.some((run) => run.workItem)) {
      setLoading(false);
      return;
    }
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const data = await api<WorkItemSummaryPage>(
          `/api/items?summary=true&ids=${encodeURIComponent([...new Set(work.runs.flatMap((run) => (run.workItem ? [run.workItem.id] : [])))].join(','))}`,
        );
        const ids = new Set(
          work.runs.flatMap((run) => (run.workItem ? [run.workItem.id] : [])),
        );
        const next = data.items
          .filter((item) => ids.has(item.id))
          .map(({ id, key, title, status, effectiveStatus, runs }) => ({
            id,
            key,
            title,
            status,
            effectiveStatus,
            runs,
          }));
        if (live) {
          setItems((old) =>
            JSON.stringify(old) === JSON.stringify(next) ? old : next,
          );
          setError('');
        }
      } catch (cause) {
        if (live) setError(errorText(cause));
      } finally {
        if (live) {
          setLoading(false);
          if (view === 'overview') timer = setTimeout(refresh, 2000);
        }
      }
    }
    void refresh();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [active, work.id, work.runs.length, retry, view]);

  const rows = useMemo(() => runRows(work, items), [work.runs, items]);
  const artifacts = useMemo(
    () => finalArtifacts(work, definitions),
    [work.runs, definitions],
  );
  function chooseView(
    next: ResultView,
    runId = next === 'overview'
      ? selected?.id
      : selectedId || work.runs.at(-1)?.id,
  ) {
    props.onViewChange(next, runId);
  }
  function openArtifacts(
    runId: string,
    request?: { groupId?: string; artifactId?: string },
  ) {
    if (request) setArtifactRequests((old) => ({ ...old, [runId]: request }));
    chooseView('artifacts', runId);
  }
  function openProcess(runId: string, artifact?: FinalArtifact) {
    if (artifact)
      setProcessFocus((old) => ({ ...old, [runId]: artifact.focus }));
    chooseView('process', runId);
  }
  const visited = [
    ...new Set([
      ...visitedArtifactRuns,
      ...(view === 'artifacts' && selected ? [selected.id] : []),
    ]),
  ];
  return (
    <Tabs
      value={view}
      onValueChange={(next) => chooseView(next as ResultView)}
      className="results-destination gap-0"
    >
      <div className="results-navigation">
        <TabsList aria-label="结果导航" className="h-9">
          <TabsTrigger value="overview">总览</TabsTrigger>
          <TabsTrigger
            value="artifacts"
            disabled={!work.runs.length && !selectedId}
          >
            本次成果
          </TabsTrigger>
          <TabsTrigger
            value="process"
            disabled={!work.runs.length && !selectedId}
          >
            执行过程
          </TabsTrigger>
        </TabsList>
        <div className="results-navigation-selection">
          <NativeSelect
            aria-label="运行记录"
            value={selectedId || ''}
            onChange={(event) =>
              chooseView(
                view === 'overview' ? 'process' : view,
                event.target.value,
              )
            }
            disabled={!work.runs.length && !selectedId}
          >
            {!selectedId && (
              <option value="" disabled>
                选择执行
              </option>
            )}
            {missingRun && <option value={selectedId}>指定执行不可用</option>}
            {[...work.runs].reverse().map((run) => (
              <option key={run.id} value={run.id}>
                {runLabel(run, rows.find((row) => row.run.id === run.id)?.item)}{' '}
                · {statusNames[run.status]} · {short(run.definitionId)}
              </option>
            ))}
          </NativeSelect>
          {selected && running(selected.status) && (
            <Button
              disabled={selected.stopRequested}
              onClick={() =>
                void props.onAction('stopRun', { runId: selected.id })
              }
            >
              停止运行
            </Button>
          )}
        </div>
      </div>
      {missingRun && (
        <div className="results-location-error" role="alert">
          找不到指定执行，未替换为其它运行。
        </div>
      )}
      <div className="results-panels" hidden={missingRun}>
        {view !== 'overview' && selected?.workItem && (
          <div className="results-run-owner">
            <span>所属工作项</span>
            <ObjectLink
              href={routeHref({ kind: 'item', id: selected.workItem.id })}
              onNavigate={() => props.onOpenItem(selected.workItem!.id)}
            >
              {selected.workItem.title}
            </ObjectLink>
            <span title={selected.definitionId}>
              固定版本 {short(selected.definitionId)}
            </span>
          </div>
        )}
        <TabsContent
          value="overview"
          forceMount
          hidden={view !== 'overview'}
          className="results-destination-body"
        >
          <ResultsOverview
            rows={rows}
            artifacts={artifacts}
            mode={mode}
            onMode={setMode}
            loading={loading}
            error={error}
            onRetry={() => setRetry((n) => n + 1)}
            onProcess={(run) => openProcess(run.id)}
            onRunArtifacts={(run) => openArtifacts(run.id)}
            onArtifact={(entry) =>
              openArtifacts(entry.run.id, { groupId: entry.groupId })
            }
          />
          {!work.runs.length && props.onInvoke && (
            <Button onClick={props.onInvoke}>直接输入运行</Button>
          )}
        </TabsContent>
        <TabsContent
          value="process"
          forceMount
          hidden={view !== 'process'}
          className="results-destination-body"
        >
          <DeferredContent active={view === 'process' && !!selected}>
            {() =>
              selected && (
                <RunProcess
                  {...props}
                  key={selected.id}
                  showRunSelection={false}
                  requestedFocus={processFocus[selected.id] || requestedFocus}
                  selectedRun={selected.id}
                  onInspectFocus={(focus) =>
                    setProcessFocus((old) => ({
                      ...old,
                      [selected.id]: focus,
                    }))
                  }
                  onRunSelect={(id) => chooseView('process', id)}
                />
              )
            }
          </DeferredContent>
        </TabsContent>
        <TabsContent
          value="artifacts"
          forceMount
          hidden={view !== 'artifacts'}
          className="results-destination-body"
        >
          {visited.map((id) => {
            const run = work.runs.find((entry) => entry.id === id);
            if (!run) return null;
            const row = rows.find((entry) => entry.run.id === id);
            return (
              <RunArtifactsPage
                key={id}
                run={run}
                definition={executionDefinition(run, definitions)}
                artifacts={artifacts.filter((entry) => entry.run.id === id)}
                identity={runLabel(run, row?.item)}
                active={active && view === 'artifacts' && selected?.id === id}
                request={artifactRequests[id]}
                controls={props}
                onProcess={(entry) => openProcess(run.id, entry)}
              />
            );
          })}
        </TabsContent>
      </div>
    </Tabs>
  );
}
