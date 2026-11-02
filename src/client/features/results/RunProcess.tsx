import { NativeSelect } from '../../components/ui/native-select';
import { useEffect, useState, type ReactNode } from 'react';
import { RunInspector } from './RunInspector';
import type { RunFocus } from './run-inspector-model';
import { Value } from './Value';
export { Value } from './Value';
import { ArtifactValue } from './ArtifactValue';
import { ArrowRight } from 'lucide-react';
import type {
  Definition,
  Inputs,
  ModelConfiguration,
  NodeResult,
  Work,
  Run,
} from '../../../shared/records';
import { active, short, statusNames } from '../../core/format';
import { Badge, Empty } from '../../components/ui';
import { Button } from '../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../../components/ui/dropdown-menu';

export function InputContent({ inputs }: { inputs: Inputs }) {
  return (
    <div className="input-content">
      {Object.entries(inputs).map(([port, items]) => (
        <div key={port}>
          {Object.keys(inputs).length > 1 && <h4>端口 · {port}</h4>}
          {items.length === 0 && <span className="meta-text">无输入</span>}
          {items.map((item, i) => (
            <div className="sample-content" key={`${item.sampleId}-${i}`}>
              <span className="sample-id">
                {item.materialIds.join(' · ') ||
                  (item.sourceResultIds.length
                    ? item.sampleId
                    : `直接输入 · ${item.sampleId}`)}
              </span>
              <ArtifactValue value={item.value} contentUrl={item.contentUrl} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
export function RunProcess({
  work,
  definitions,
  selectedRun,
  onRunSelect,
  selectedResults,
  onSelectResults,
  onAction,
  onCandidate,
  onContinue,
  onInvoke,
  selectedDefinitionId,
  configuration,
  onOpenSettings,
  requestedFocus,
  onInspectFocus,
  showRunSelection = true,
}: {
  showRunSelection?: boolean;
  requestedFocus?: RunFocus;
  onInspectFocus?: (focus: RunFocus) => void;
  work: Work;
  definitions: Record<string, Definition>;
  selectedRun?: string;
  onRunSelect: (id: string) => void;
  selectedResults: string[];
  onSelectResults: (ids: string[]) => void;
  onAction: (
    action: string,
    fields?: Record<string, unknown>,
  ) => Promise<unknown>;
  onCandidate: (result: NodeResult) => void;
  onContinue: () => void;
  onInvoke?: () => void;
  selectedDefinitionId?: string;
  configuration?: ModelConfiguration | null;
  onOpenSettings?: () => void;
}) {
  const run =
    work.runs.find((r) => r.id === selectedRun) ||
    work.runs[work.runs.length - 1];
  const [localFocus, setLocalFocus] = useState<RunFocus>();
  useEffect(() => {
    if (requestedFocus?.workId === work.id) setLocalFocus(requestedFocus);
  }, [requestedFocus, work.id]);
  if (!run)
    return (
      <Empty title="还没有运行结果">
        <p>选择材料，运行流程后将在这里看到逐条进展。</p>
        {onInvoke && (
          <Button size="sm" variant="default" onClick={onInvoke}>
            直接输入运行
          </Button>
        )}
      </Empty>
    );
  const focus: RunFocus =
    localFocus && (localFocus.workId !== work.id || localFocus.runId === run.id)
      ? localFocus
      : { workId: work.id, runId: run.id, definitionId: run.definitionId };
  const viewingSource = focus.workId !== work.id;
  const toggle = (id: string) =>
    onSelectResults(
      selectedResults.includes(id)
        ? selectedResults.filter((x) => x !== id)
        : [...selectedResults, id],
    );
  return (
    <div className="results-view">
      {!viewingSource && (
        <>
          {showRunSelection && (
            <div className="results-toolbar">
              <label>
                运行记录
                <NativeSelect
                  layout="fit"
                  aria-label="运行记录"
                  value={run.id}
                  onChange={(e) => {
                    setLocalFocus(undefined);
                    onRunSelect(e.target.value);
                  }}
                >
                  {[...work.runs].reverse().map((r, i) => (
                    <option key={r.id} value={r.id}>
                      {new Date(r.startedAt).toLocaleTimeString()} ·{' '}
                      {r.scope === 'full'
                        ? '完整流程'
                        : definitions[r.definitionId]?.nodes.find(
                            (n) =>
                              n.id ===
                              (typeof r.scope === 'object'
                                ? r.scope.nodeId
                                : ''),
                          )?.label || '单节点'}{' '}
                      · {statusNames[r.status]} · {short(r.definitionId)}
                      {r.invocation?.loose ? ' · 宽松调用' : ''}
                      {r.invocation?.repairedPorts?.length ? ' · 自动修复' : ''}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <Badge status={run.status} />
              {active(run.status) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void onAction('stopRun', { runId: run.id })}
                  disabled={run.stopRequested}
                >
                  停止运行
                </Button>
              )}
            </div>
          )}
          <div className="run-meta">
            <span>
              做法 {short(run.definitionId)} ·{' '}
              {run.definitionId === work.adoptedId
                ? '当前采用'
                : run.definitionId === work.draftId
                  ? '候选'
                  : '历史版本'}
            </span>
            <span>
              {run.results.filter((r) => r.status === 'completed').length}{' '}
              条完成 / {run.results.length} 个执行实例
            </span>
            <span>输入 {Object.values(run.inputs).flat().length} 条</span>
            {run.invocation?.loose && <span>宽松调用</span>}
            {!!run.invocation?.repairedPorts?.length && (
              <span>
                端口 {run.invocation.repairedPorts.join('、')} 经自动修复
              </span>
            )}
          </div>
          {run.error && <p className="inline-error">{run.error}</p>}
        </>
      )}
      <div className="scroll results-body">
        {!viewingSource && showRunSelection && run.workItem && (
          <div className="run-business-context">
            <div className="run-business-title">
              <strong>{run.workItem.title}</strong>
              <small title={run.workItem.key}>{run.workItem.key}</small>
            </div>
            <span>
              工作项输入修订 {run.workItem.revision} ·{' '}
              {run.effectMode === 'commit'
                ? run.scope === 'full'
                  ? '正式推进'
                  : '单步骤正式处理'
                : '试运行'}
            </span>
          </div>
        )}
        {!viewingSource && !!run.waits?.length && (
          <details className="details" open={run.status === 'waiting'}>
            <summary>等待与触发记录</summary>
            {run.waits.map((wait) => (
              <div className="run-wait-record" key={wait.nodeId}>
                <strong>{wait.reason}</strong>
                <p>
                  {wait.event} ·{' '}
                  {wait.status === 'pending'
                    ? '等待中'
                    : wait.releasedBy === 'timer'
                      ? '到期已继续'
                      : '事件已继续'}
                  {wait.dueAt
                    ? ` · 到期 ${new Date(wait.dueAt).toLocaleString()}`
                    : ''}
                </p>
              </div>
            ))}
            {run.signals?.map((signal) => (
              <div className="run-wait-record" key={signal.id}>
                <strong>{signal.name}</strong>
                <p>
                  接收于 {new Date(signal.receivedAt).toLocaleString()} ·{' '}
                  {signal.id}
                </p>
                {signal.payload !== undefined && (
                  <Value value={signal.payload} />
                )}
              </div>
            ))}
          </details>
        )}
        <section aria-label="成果检查">
          <RunInspector
            key={run.id}
            rootFocus={{
              workId: work.id,
              runId: run.id,
              definitionId: run.definitionId,
            }}
            showIdentity={viewingSource || focus.runId !== run.id}
            snapshots={{ [work.id]: { work, definitions } }}
            focus={focus}
            onFocus={(next) => {
              setLocalFocus(next);
              if (next.workId === work.id) {
                if (next.runId !== run.id) onRunSelect(next.runId);
                onInspectFocus?.(next);
              }
            }}
            actions={(artifact, result, execution) =>
              artifact.source.workId === work.id ? (
                <MethodResultActions
                  work={work}
                  run={execution}
                  result={result}
                  selected={selectedResults.includes(result.id)}
                  onSelect={() => toggle(result.id)}
                  selectedDefinitionId={selectedDefinitionId}
                  definitions={definitions}
                  onAction={onAction}
                  onCandidate={onCandidate}
                  onOpenSettings={onOpenSettings}
                />
              ) : null
            }
          />
        </section>
      </div>
      {!viewingSource && selectedResults.length > 0 && (
        <div className="selection-bar">
          <span>跨运行已选 {selectedResults.length} 条结果</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void onAction('keepResults', { resultIds: selectedResults })
            }
          >
            保留所选结果
          </Button>
          <Button size="sm" variant="default" onClick={onContinue}>
            用所选结果续做
            <ArrowRight size={15} />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onSelectResults([])}>
            清除
          </Button>
        </div>
      )}
    </div>
  );
}

export function MethodResultActions({
  work,
  run,
  result,
  selected,
  onSelect,
  selectedDefinitionId,
  definitions,
  onAction,
  onCandidate,
  onOpenSettings,
  usageOnly = false,
  extraActions,
}: {
  usageOnly?: boolean;
  extraActions?: ReactNode;
  work: Work;
  run: Run;
  result: NodeResult;
  selected: boolean;
  onSelect: () => void;
  selectedDefinitionId?: string;
  definitions: Record<string, Definition>;
  onAction: (
    action: string,
    fields?: Record<string, unknown>,
  ) => Promise<unknown>;
  onCandidate: (result: NodeResult) => void;
  onOpenSettings?: () => void;
}) {
  const parentDynamic = run.expansions?.find((expansion) =>
    result.nodeId.startsWith(`${expansion.nodeId}/`),
  )?.nodeId;
  const expansion = run.expansions?.find(
    (entry) =>
      result.nodeId === entry.nodeId ||
      result.nodeId.startsWith(`${entry.nodeId}/`),
  );
  if (usageOnly)
    return (
      <>
        <label className="check-row">
          <input
            type="checkbox"
            aria-label="选择此结果"
            checked={selected}
            onChange={onSelect}
          />
          选择
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost">
              更多
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() =>
                void onAction('keepResults', { resultIds: [result.id] })
              }
            >
              {work.keptResultIds.includes(result.id) ? '已保留' : '保留此结果'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                onCandidate(
                  parentDynamic ? { ...result, nodeId: parentDynamic } : result,
                )
              }
            >
              {parentDynamic ? '改进所属动态步骤' : '从此结果改进'}
            </DropdownMenuItem>
            {extraActions}
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    );
  return (
    <>
      <label className="check-row">
        <input
          type="checkbox"
          aria-label="选择此结果"
          checked={selected}
          disabled={result.status !== 'completed' || !!result.purpose}
          onChange={onSelect}
        />
        选择
      </label>
      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          onCandidate(
            parentDynamic ? { ...result, nodeId: parentDynamic } : result,
          )
        }
      >
        {parentDynamic ? '改进所属动态步骤' : '从此结果改进'}
      </Button>
      {!usageOnly &&
        result.status === 'failed' &&
        definitions[run.definitionId]?.nodes.some(
          (node) => node.id === result.nodeId,
        ) && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void onAction('retry', {
                  runId: run.id,
                  resultIds: [result.id],
                  definitionId: selectedDefinitionId || run.definitionId,
                })
              }
            >
              用所选做法重试此输入
            </Button>
            {result.effectiveModel && onOpenSettings && (
              <Button size="sm" variant="ghost" onClick={onOpenSettings}>
                检查模型设置
              </Button>
            )}
          </>
        )}
      {!usageOnly && expansion && (
        <Button
          size="sm"
          variant="ghost"
          disabled={
            run.nodeStates[expansion.nodeId] !== 'completed' ||
            !definitions[work.draftId ?? work.adoptedId ?? '']?.nodes.some(
              (node) => node.id === expansion.nodeId && node.kind === 'dynamic',
            )
          }
          onClick={() =>
            void onAction('freezeExpansion', {
              expectedDraftId: work.draftId,
              runId: run.id,
              nodeId: expansion.nodeId,
            })
          }
        >
          保存为候选做法
        </Button>
      )}
      {result.status === 'completed' && !result.purpose && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void onAction('keepResults', { resultIds: [result.id] })
          }
        >
          {work.keptResultIds.includes(result.id) ? '已保留' : '保留此结果'}
        </Button>
      )}
    </>
  );
}
