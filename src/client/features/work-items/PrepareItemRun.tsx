import { ChildStageChoices } from './ChildStageChoices';
import { CompletionInputChoices } from './CompletionInputChoices';
import { nodeInputPorts } from '../../../shared/node-ports';
import { useEffect, useState, type FormEvent } from 'react';
import type {
  Snapshot,
  WorkItemView,
  WorkSummary,
  ItemInputSelection,
} from '../../../shared/records';
import { api } from '../../core/api';
import { runAction } from '../../core/action';
import { errorText, short, workTitle } from '../../core/format';
import { Button } from '../../components/ui/button';
import { NativeSelect } from '../../components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../components/ui/dialog';

/** Prepare explicit inputs for the current method, without changing its samples. */
export function PrepareItemRun({
  item,
  methods,
  initialSelections,
  active = true,
  onEditMethod,
  onClose,
  onStarted,
}: {
  item: WorkItemView;
  methods: WorkSummary[];
  initialSelections?: ItemInputSelection[];
  active?: boolean;
  onEditMethod: (id: string) => void;
  onClose: () => void;
  onStarted: (item: WorkItemView) => void;
}) {
  const childStages = !initialSelections?.some((s) => s.kind === 'completion');
  const [methodId, setMethodId] = useState('');
  const [portInputs, setPortInputs] = useState<
    Record<string, ItemInputSelection[]>
  >({});
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [definitionId, setDefinitionId] = useState('');
  const [scopeNodeId, setScopeNodeId] = useState('');
  const [singleInputs, setSingleInputs] = useState<ItemInputSelection[]>(
    initialSelections || [],
  );
  const [error, setError] = useState('');
  const [loadingError, setLoadingError] = useState('');
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!active || !methodId) return;
    let live = true;
    api<Snapshot>(`/api/works/${methodId}`)
      .then((next) => {
        if (!live) return;
        setSnapshot(next);
        setDefinitionId(
          (current) =>
            (next.work.definitionIds.includes(current) ? current : undefined) ||
            next.work.adoptedId ||
            next.work.draftId ||
            '',
        );
        setLoadingError('');
      })
      .catch((cause) => {
        if (live) setLoadingError(errorText(cause));
      });
    return () => {
      live = false;
    };
  }, [methodId, retry, active]);
  const definition = snapshot?.definitions[definitionId];
  const selectedNode = definition?.nodes.find(
    (node) => node.id === scopeNodeId,
  );
  const ports = selectedNode
    ? nodeInputPorts(selectedNode)
    : definition?.inputs || [];
  const selections = Object.fromEntries(
    ports.map((port) => [
      port,
      ports.length === 1 ? singleInputs : portInputs[port] || [],
    ]),
  );
  const selectedCount = Object.values(selections).reduce(
    (count, values) => count + values.reduce((n, value) => n + 1, 0),
    0,
  );
  const missingInput = ports.some(
    (port) =>
      !selections[port].length &&
      definition?.inputContracts?.[port]?.required !== false,
  );
  function chooseInputs(port: string, inputs: ItemInputSelection[]) {
    if (ports.length === 1) setSingleInputs(inputs);
    else setPortInputs((current) => ({ ...current, [port]: inputs }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await runAction(
      async () => {
        const prepared = await api<
          import('../../../shared/workitem-composition').ItemWorkspace
        >(`/api/items/${item.id}/workspace/actions`, {
          action: 'useMethod',
          baseRevision: item.revision,
          methodId,
          definitionId,
          scope: scopeNodeId ? { nodeId: scopeNodeId } : 'full',
          inputBindings: selections,
        });
        const next = await api<
          import('../../../shared/workitem-composition').ItemWorkspace
        >(`/api/items/${item.id}/workspace/actions`, {
          action: 'run',
          baseRevision: prepared.item.revision,
        });
        onStarted(next.item);
      },
      { setBusy, setError },
    );
  }
  return (
    <>
      <Dialog
        open={active}
        onOpenChange={(open) => {
          if (!open && !busy) onClose();
        }}
      >
        <DialogContent
          className={`modal ${childStages ? 'child-stage-dialog' : ''}`}
        >
          <DialogHeader>
            <DialogTitle>准备本次执行</DialogTitle>
            <DialogDescription className="sr-only">
              选择保存版本与本次工作项材料
            </DialogDescription>
          </DialogHeader>
          <form className="stack" onSubmit={submit}>
            {childStages && ports.length <= 1 && (
              <ChildStageChoices
                itemId={item.id}
                selected={singleInputs}
                onChange={setSingleInputs}
                busy={busy}
              />
            )}
            <div className="item-form-pair">
              <label className="field">
                处理方法
                <NativeSelect
                  value={methodId}
                  disabled={busy}
                  onChange={(event) => {
                    setMethodId(event.target.value);
                    setSnapshot(undefined);
                    setDefinitionId('');
                    setScopeNodeId('');
                    setPortInputs({});
                    setLoadingError('');
                  }}
                >
                  {!methodId && <option value="">请选择处理方法</option>}
                  {!!methodId &&
                    !methods.some((method) => method.id === methodId) && (
                      <option value={methodId}>
                        {snapshot ? workTitle(snapshot.work) : '当前方法'}
                      </option>
                    )}
                  {methods.map((method) => (
                    <option key={method.id} value={method.id}>
                      {workTitle(method)}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="field">
                保存版本
                <NativeSelect
                  value={definitionId}
                  onChange={(event) => {
                    setDefinitionId(event.target.value);
                    setScopeNodeId('');
                  }}
                  disabled={!snapshot || busy}
                >
                  {!definitionId && <option value="">请选择保存版本</option>}
                  {snapshot?.work.definitionIds.map((id, index) => (
                    <option key={id} value={id}>
                      {id === snapshot.work.adoptedId
                        ? '采用的做法'
                        : id === snapshot.work.draftId
                          ? '当前保存草稿'
                          : `保存版本 ${index + 1}`}{' '}
                      · {short(id)}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            </div>
            <label className="field">
              处理范围
              <NativeSelect
                value={scopeNodeId}
                onChange={(event) => setScopeNodeId(event.target.value)}
                disabled={busy || !definition}
              >
                <option value="">完整流程</option>
                {definition?.nodes
                  .filter((node) => ['agent', 'function'].includes(node.kind))
                  .map((node) => (
                    <option key={node.id} value={node.id}>
                      单步骤 · {node.label}
                    </option>
                  ))}
              </NativeSelect>
            </label>
            <div className="inline-group">
              <Button
                type="button"
                variant="ghost"
                disabled={busy || !methodId}
                onClick={() =>
                  void runAction(
                    async () => {
                      onEditMethod(methodId);
                    },
                    { setBusy, setError },
                  )
                }
              >
                编辑所选方法
              </Button>
              <span>
                {scopeNodeId ? '单步骤正式处理' : '正式处理 · 完整流程'}
              </span>
              <span className="muted">{item.title}</span>
            </div>
            {loadingError && (
              <div className="error-banner" role="alert">
                {loadingError}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  重新读取
                </Button>
              </div>
            )}
            {(childStages && ports.length === 1 ? [] : ports).map((port) => (
              <section
                key={port}
                aria-label={
                  ports.length === 1 ? '本次输入材料' : `输入入口 ${port}`
                }
              >
                <div className="materials-toolbar">
                  <strong>
                    {ports.length === 1 ? '本次输入' : `输入入口 · ${port}`}
                  </strong>
                  <span>
                    已选 {selections[port].reduce((n, s) => n + 1, 0)} 项
                  </span>
                </div>
                {childStages ? (
                  <ChildStageChoices
                    itemId={item.id}
                    selected={selections[port]}
                    onChange={(inputs) => chooseInputs(port, inputs)}
                    busy={busy}
                  />
                ) : (
                  <CompletionInputChoices
                    choices={initialSelections || []}
                    selected={selections[port]}
                    inputs={[]}
                    onChange={(inputs) => chooseInputs(port, inputs)}
                  />
                )}
              </section>
            ))}
            {definition?.nodes.some((node) => node.kind === 'create-items') && (
              <div role="note" className="inline-group">
                建立子项 · 正式执行将保存到当前工作项
              </div>
            )}
            {initialSelections?.some((s) => s.kind === 'completion') && (
              <p>已选确认结论 {initialSelections.length} 项</p>
            )}
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={onClose}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={busy || !definition || missingInput}
              >
                {busy ? '正在启动…' : `开始处理 ${selectedCount} 项输入`}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
