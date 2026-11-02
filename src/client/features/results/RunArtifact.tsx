import {
  DeferredContent,
  DeferredDetails,
} from '../../components/DeferredContent';
import { useState, type ReactNode } from 'react';
import type { NodeResult, Run } from '../../../shared/records';
import { Button, Modal } from '../../components/ui';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/tabs';
import { effectiveModelLabel } from '../settings/catalog-model';
import { ArtifactValue } from './ArtifactValue';
import { RunSources } from './RunSources';
import { ArtifactHeading, ArtifactViewControls } from './ArtifactPresentation';
import { dateTime, portLabel, statusNames } from '../../core/format';
import {
  executionDefinition,
  type RunFocus,
  type RunSnapshot,
  type InspectedArtifact,
} from './run-inspector-model';

export function RunArtifact({
  heading,
  snapshots,
  run,
  result,
  artifact,
  onNavigate,
  onMaterial,
  actions,
}: {
  heading: string;
  snapshots: Record<string, RunSnapshot>;
  run: Run;
  result: NodeResult;
  artifact: InspectedArtifact;
  onNavigate: (source: RunFocus) => void;
  onMaterial?: (id: string) => void;
  actions?: ReactNode;
}) {
  const [materialId, setMaterialId] = useState<string>();
  const [tab, setTab] = useState('output');
  const [basisOpen, setBasisOpen] = useState(false);
  const saved = snapshots[artifact.source.workId];
  const original = saved?.definitions[run.definitionId];
  const node =
    saved &&
    executionDefinition(run, saved.definitions)?.nodes.find(
      (node) => node.id === result.nodeId,
    );
  const requirements = Object.entries({
    职责: node?.contract?.responsibility,
    完成条件: node?.contract?.done,
    依据: node?.contract?.rationale,
    角色: node?.contract?.semanticRole,
    任务: node?.task,
    范围: node?.dynamic?.boundary,
  }).filter(([, value]) => value);
  const basis =
    original?.problem &&
    Object.entries({
      目标: original.problem.framing,
      已知事实: original.problem.known,
      待确认: original.problem.unknown,
      约束: original.problem.constraints,
      来源: original.problem.evidence,
    }).filter(([, value]) => value);
  const [view, setView] = useState<'content' | 'raw'>('content');
  const values = Object.entries(result.outputs).flatMap(([port, items]) =>
    items.map((item, index) => ({ port, index, item })),
  );

  return (
    <>
      <ArtifactHeading
        heading={heading}
        result={result}
        actions={actions}
        copyValue={
          !values.length || values.some((v) => v.item.contentUrl)
            ? undefined
            : values.length === 1
              ? values[0].item.value
              : artifact.value
        }
      />
      {result.call && (
        <Button variant="ghost" onClick={() => onNavigate(result.call!)}>
          查看方法内执行
        </Button>
      )}
      <Tabs value={tab} onValueChange={setTab} className="item-artifact-tabs">
        <div className="item-artifact-toolbar">
          <TabsList variant="line">
            <TabsTrigger value="output">产物 {values.length || ''}</TabsTrigger>
            <TabsTrigger value="input">输入与依据</TabsTrigger>
            <TabsTrigger value="activity">
              执行记录 {result.activities.length || ''}
            </TabsTrigger>
          </TabsList>
          {tab === 'output' && values.length > 0 && (
            <ArtifactViewControls value={view} onChange={setView} />
          )}
        </div>
        <TabsContent value="output" forceMount hidden={tab !== 'output'}>
          <DeferredContent active={tab === 'output'}>
            {() => (
              <>
                {result.error && <p className="inline-error">{result.error}</p>}
                {result.purpose && result.proposedDefinition && (
                  <DeferredDetails className="details" summary="生成的提案">
                    {() => (
                      <pre>
                        {JSON.stringify(result.proposedDefinition, null, 2)}
                      </pre>
                    )}
                  </DeferredDetails>
                )}
                {!values.length && (
                  <p className="muted">
                    {result.status === 'running'
                      ? '正在处理，尚无产物。报告进展可在业务记录中查看。'
                      : '此实例没有产物。'}
                  </p>
                )}
                {(artifact.source.port !== undefined &&
                  !values.some(
                    (entry) =>
                      entry.port === artifact.source.port &&
                      (artifact.source.index === undefined ||
                        entry.index === artifact.source.index),
                  )) ||
                (artifact.source.index !== undefined &&
                  artifact.source.port === undefined) ? (
                  <p role="alert">
                    指定端口或产物索引不可用，未替换为其它产物。
                  </p>
                ) : values.length === 1 ? (
                  <ArtifactValue
                    value={values[0].item.value}
                    contentUrl={values[0].item.contentUrl}
                    view={view}
                  />
                ) : (
                  values.map(({ port, index, item }) => (
                    <DeferredDetails
                      key={`${port}-${index}`}
                      className="item-output-entry"
                      open={
                        artifact.source.port === port &&
                        artifact.source.index === index
                          ? true
                          : undefined
                      }
                      summary={
                        <>
                          {portLabel(port)} · 条目 {index + 1}
                        </>
                      }
                    >
                      {() => (
                        <>
                          <ArtifactValue
                            value={item.value}
                            contentUrl={item.contentUrl}
                            view={view}
                          />
                        </>
                      )}
                    </DeferredDetails>
                  ))
                )}
              </>
            )}
          </DeferredContent>
        </TabsContent>
        <TabsContent value="input" forceMount hidden={tab !== 'input'}>
          <DeferredContent active={tab === 'input'}>
            {() => (
              <>
                {!!basis?.length && (
                  <Button variant="ghost" onClick={() => setBasisOpen(true)}>
                    运行依据
                  </Button>
                )}
                {requirements.length > 0 && (
                  <DeferredDetails
                    className="item-tool-record"
                    summary="环节要求"
                  >
                    {() => (
                      <dl className="run-reference-fields">
                        {requirements.map(([label, value]) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </DeferredDetails>
                )}
                <h4>来源</h4>
                <RunSources
                  result={result}
                  materials={
                    run.workItem?.materials || saved?.work.materials || []
                  }
                  snapshots={snapshots}
                  onNavigate={onNavigate}
                  onMaterial={(id) =>
                    onMaterial ? onMaterial(id) : setMaterialId(id)
                  }
                />
                <div className="item-frozen-inputs">
                  {Object.entries(result.input).map(([port, items]) => (
                    <div key={port}>
                      <h4>
                        {portLabel(port)} · 固定输入 {items.length} 项
                      </h4>
                      {items.map((input, index) => (
                        <DeferredDetails
                          key={`${input.sampleId}-${index}`}
                          summary={<>第 {index + 1} 项 · 查看当时内容</>}
                        >
                          {() => (
                            <>
                              <p className="muted">
                                关联原始材料：
                                {input.materialIds.length
                                  ? input.materialIds.join('、')
                                  : '无'}
                              </p>
                              <ArtifactValue
                                value={input.value}
                                contentUrl={input.contentUrl}
                              />
                            </>
                          )}
                        </DeferredDetails>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </DeferredContent>
        </TabsContent>
        <TabsContent value="activity" forceMount hidden={tab !== 'activity'}>
          <DeferredContent active={tab === 'activity'}>
            {() => (
              <>
                <p className="muted">
                  {dateTime(result.startedAt)} →{' '}
                  {result.finishedAt
                    ? dateTime(result.finishedAt)
                    : statusNames[result.status]}
                </p>
                {result.effectiveModel && (
                  <p className="muted">
                    {effectiveModelLabel(result.effectiveModel)}
                  </p>
                )}
                {result.error && <p className="inline-error">{result.error}</p>}
                {result.activities.map((activity) => (
                  <DeferredDetails
                    className="item-tool-record"
                    key={activity.id}
                    summary={
                      <>
                        {activity.toolName} · {statusNames[activity.status]}
                      </>
                    }
                  >
                    {() => (
                      <>
                        {activity.contentUrl && (
                          <ArtifactValue
                            value={null}
                            contentUrl={activity.contentUrl}
                          />
                        )}
                        {activity.args !== undefined && (
                          <ArtifactValue value={activity.args} />
                        )}
                        {activity.result !== undefined && (
                          <ArtifactValue value={activity.result} />
                        )}
                        {activity.error && (
                          <p className="inline-error">{activity.error}</p>
                        )}
                      </>
                    )}
                  </DeferredDetails>
                ))}
                <DeferredDetails
                  className="item-tool-record"
                  summary={<>运行与实例标识</>}
                >
                  {() => (
                    <>
                      <code>
                        运行 {run.id}
                        <br />
                        版本 {run.definitionId}
                        <br />
                        实例 {result.instanceId}
                      </code>
                    </>
                  )}
                </DeferredDetails>
              </>
            )}
          </DeferredContent>
        </TabsContent>
      </Tabs>
      <Modal open={basisOpen} onOpenChange={setBasisOpen} title="运行依据">
        {basisOpen && (
          <dl className="run-reference-fields">
            {basis?.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </Modal>
      <Modal
        open={!!materialId}
        onOpenChange={(open) => {
          if (!open) setMaterialId(undefined);
        }}
        title={`本轮固定材料 ${materialId || ''}`}
      >
        {(
          run.workItem?.materials ||
          run.materials ||
          saved?.work.materials ||
          []
        ).find((m) => m.id === materialId)?.contentUrl ? (
          <ArtifactValue
            value={null}
            contentUrl={
              (
                run.workItem?.materials ||
                run.materials ||
                saved?.work.materials ||
                []
              ).find((m) => m.id === materialId)?.contentUrl
            }
          />
        ) : (
          Object.values(result.input)
            .flat()
            .filter((input) => input.materialIds.includes(materialId || ''))
            .map((input, index) => (
              <ArtifactValue
                key={index}
                value={input.value}
                contentUrl={input.contentUrl}
              />
            ))
        )}
      </Modal>
    </>
  );
}
