import { RunSummary } from './RunSummary';
import { isRunResultSummary } from '../../../shared/result-summary';
import type { Definition } from '../../../shared/records';
import { memo, useEffect, useRef, useState, type ComponentProps } from 'react';
import type { Run } from '../../../shared/records';
import { Button } from '../../components/ui';
import { ArtifactValue } from './ArtifactValue';
import { ArtifactHeading, ArtifactViewControls } from './ArtifactPresentation';
import { RunGroupNavigation, RunInstancePicker } from './RunSelection';
import { MethodResultActions, RunProcess } from './RunProcess';
import { artifactGroups, type FinalArtifact } from './result-overview-model';
import './RunArtifactsPage.css';

type Props = {
  run: Run;
  definition?: Definition;
  artifacts: FinalArtifact[];
  identity: string;
  active: boolean;
  request?: { groupId?: string; artifactId?: string };
  controls: ComponentProps<typeof RunProcess>;
  onProcess: (artifact?: FinalArtifact) => void;
};

/** Keep only visited readers mounted; inactive runs do not consume background snapshots. */
export const RunArtifactsPage = memo(
  function RunArtifactsPage({
    run,
    definition,
    artifacts,
    identity,
    active,
    request,
    controls,
    onProcess,
  }: Props) {
    const [selectedId, setSelectedId] = useState<string | undefined>(
      () =>
        request?.artifactId ||
        artifacts.find((item) => item.groupId === request?.groupId)?.id ||
        artifacts[0]?.id,
    );
    const [requestError, setRequestError] = useState('');
    const [visited, setVisited] = useState<string[]>([]);
    const selectedByGroup = useRef<Record<string, string>>({});
    const consumedRequest = useRef<Props['request']>(undefined);
    const selected = !requestError
      ? artifacts.find((item) => item.id === selectedId)
      : undefined;
    const groups = artifactGroups(artifacts);
    const currentGroup = groups.find((group) => group.id === selected?.groupId);
    useEffect(() => {
      if (!active || !request || consumedRequest.current === request) return;
      consumedRequest.current = request;
      setRequestError('');
      if (request.artifactId) setSelectedId(request.artifactId);
      else if (request.groupId) {
        const first = artifacts.find(
          (item) => item.groupId === request.groupId,
        );
        if (!first) setRequestError('找不到指定的成果分组，未替换为其它成果。');
        else
          setSelectedId((previous) =>
            artifacts.find((item) => item.id === previous)?.groupId ===
            request.groupId
              ? previous
              : first.id,
          );
      }
    }, [request, active]);
    useEffect(() => {
      if (
        !selectedId &&
        !request?.artifactId &&
        !request?.groupId &&
        artifacts[0]
      )
        setSelectedId(artifacts[0].id);
      if (selected) selectedByGroup.current[selected.groupId] = selected.id;
      if (selected)
        setVisited((old) =>
          old.includes(selected.id) ? old : [...old, selected.id],
        );
    }, [selected?.id, artifacts.length]);
    const binding =
      definition?.summaryOutput && definition.outputs[definition.summaryOutput];
    const summaries = binding
      ? artifacts.filter(
          (artifact) =>
            artifact.result.nodeId === binding[0] &&
            artifact.port === binding[1],
        )
      : [];
    const summary =
      summaries.length === 1 && isRunResultSummary(summaries[0].value)
        ? summaries[0].value
        : undefined;
    const shown = new Set([...visited, ...(selected ? [selected.id] : [])]);
    return (
      <section
        className="run-artifacts-page"
        aria-label="运行成果"
        hidden={!active}
        data-run-id={run.id}
      >
        <div className="muted mb-4 text-xs">{identity}</div>
        {summary && <RunSummary summary={summary} />}
        {(groups.length > 1 || (!selected && groups.length > 0)) && (
          <RunGroupNavigation
            label="成果分组"
            items={groups.map((group) => ({
              id: group.id,
              label: group.title,
              status: 'completed',
              count: group.items.length,
            }))}
            selectedId={selected?.groupId}
            onSelect={(id) => {
              setRequestError('');
              setSelectedId(
                artifacts.some(
                  (item) =>
                    item.id === selectedByGroup.current[id] &&
                    item.groupId === id,
                )
                  ? selectedByGroup.current[id]
                  : groups.find((group) => group.id === id)?.items[0].id,
              );
            }}
          />
        )}
        {(!definition || requestError || (selectedId && !selected)) && (
          <p role="alert">
            {!definition
              ? '这轮执行的固定定义不可用，未替换为当前草稿。'
              : requestError || '找不到指定的成果，未替换为其它记录。'}
          </p>
        )}
        {currentGroup && !requestError && (
          <RunInstancePicker
            items={currentGroup.items.map((item) => ({
              id: item.id,
              resultId: item.result.id,
              label: item.itemLabel,
              status: item.result.status,
              value: item.value,
              iteration: item.result.iteration,
            }))}
            selectedId={selected?.id}
            onSelect={setSelectedId}
          />
        )}
        <div className="run-artifacts-reading">
          {!selected && !requestError && !selectedId && definition && (
            <div className="item-retained-artifact flex-1">
              <ArtifactHeading
                heading="运行成果"
                result={{ status: run.status }}
                actions={<Button onClick={() => onProcess()}>查看过程</Button>}
              />
              <p className="muted">此运行尚无可查看的成果。</p>
            </div>
          )}
          {artifacts
            .filter((item) => shown.has(item.id))
            .map((item) => (
              <ArtifactReader
                key={item.id}
                artifact={item}
                active={selected?.id === item.id && active}
                controls={controls}
                onProcess={() => onProcess(item)}
              />
            ))}
        </div>
      </section>
    );
  },
  (previous, next) => !previous.active && !next.active,
);

const ArtifactReader = memo(
  function ArtifactReader({
    artifact,
    active,
    controls,
    onProcess,
  }: {
    artifact: FinalArtifact;
    active: boolean;
    controls: Props['controls'];
    onProcess: () => void;
  }) {
    const [view, setView] = useState<'content' | 'raw'>('content');
    const { work, definitions } = controls;
    return (
      <section
        className="item-retained-artifact run-artifact-pane"
        aria-label="成果详情"
        data-artifact-id={artifact.id}
        data-result-id={artifact.result.id}
        hidden={!active}
      >
        <ArtifactHeading
          heading={artifact.title}
          result={artifact.result}
          copyValue={artifact.contentUrl ? undefined : artifact.value}
          actions={
            <>
              <Button onClick={onProcess}>查看过程</Button>
              <MethodResultActions
                usageOnly
                work={work}
                run={artifact.run}
                result={artifact.result}
                selected={controls.selectedResults.includes(artifact.result.id)}
                onSelect={() =>
                  controls.onSelectResults(
                    controls.selectedResults.includes(artifact.result.id)
                      ? controls.selectedResults.filter(
                          (id) => id !== artifact.result.id,
                        )
                      : [...controls.selectedResults, artifact.result.id],
                  )
                }
                selectedDefinitionId={controls.selectedDefinitionId}
                definitions={definitions}
                onAction={controls.onAction}
                onCandidate={controls.onCandidate}
                onOpenSettings={controls.onOpenSettings}
              />
            </>
          }
        />
        <div className="item-artifact-toolbar">
          <ArtifactViewControls value={view} onChange={setView} />
        </div>
        <ArtifactValue
          value={artifact.value}
          contentUrl={artifact.contentUrl}
          view={view}
        />
        {controls.selectedResults.length > 0 && (
          <div className="selection-bar">
            <span>已选 {controls.selectedResults.length} 份成果</span>
            <Button
              onClick={() =>
                void controls.onAction('keepResults', {
                  resultIds: controls.selectedResults,
                })
              }
            >
              保留所选结果
            </Button>
            <Button onClick={controls.onContinue}>用所选结果续做</Button>
          </div>
        )}
      </section>
    );
  },
  (previous, next) => !previous.active && !next.active,
);
