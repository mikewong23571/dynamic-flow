import { useState } from 'react';
import type {
  ItemWorkspace,
  MethodCapability,
} from '../../../../shared/workitem-composition';
import type {
  OutputReference,
  Snapshot,
  WorkItemView,
} from '../../../../shared/records';
import { Modal } from '../../../components/ui';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Textarea } from '../../../components/ui/textarea';
import { NativeSelect } from '../../../components/ui/native-select';
import { api } from '../../../core/api';
import { errorText, newId } from '../../../core/format';

export function ContinueItemRecords({
  selection,
  methods,
  busy,
  onClose,
  onContinue,
}: {
  selection: { deliveryId: string; recordIds: string[] };
  methods: MethodCapability[];
  busy: boolean;
  onClose: () => void;
  onContinue: (fields: Record<string, unknown>) => Promise<unknown>;
}) {
  const [method, setMethod] = useState(''),
    [inputPort, setInputPort] = useState(''),
    [error, setError] = useState('');
  const chosen = methods.find(
    (m) => `${m.workId}:${m.definitionId}` === method,
  );
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="用所选记录继续"
    >
      <div className="stack">
        <strong>{selection.recordIds.length} 条记录</strong>
        <label className="field">
          接下来使用的方法
          <NativeSelect
            aria-label="后续处理方法"
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
              setInputPort(
                methods.find(
                  (m) => `${m.workId}:${m.definitionId}` === e.target.value,
                )?.inputs[0] || '',
              );
            }}
          >
            <option value="">当前处理流程</option>
            {methods.map((m) => (
              <option
                key={`${m.workId}:${m.definitionId}`}
                value={`${m.workId}:${m.definitionId}`}
              >
                {m.title} · {m.adopted ? '采用版' : '保存版'}{' '}
                {m.definitionId.slice(0, 6)}
              </option>
            ))}
          </NativeSelect>
        </label>
        {chosen && chosen.inputs.length > 1 && (
          <label className="field">
            接收所选记录
            <NativeSelect
              value={inputPort}
              onChange={(e) => setInputPort(e.target.value)}
            >
              {chosen.inputs.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="default"
            disabled={busy}
            onClick={() => {
              setError('');
              void onContinue({
                ...selection,
                ...(chosen
                  ? {
                      methodId: chosen.workId,
                      methodDefinitionId: chosen.definitionId,
                      inputPort,
                    }
                  : {}),
              })
                .then(onClose)
                .catch((e) => setError(errorText(e)));
            }}
          >
            准备本轮输入
          </Button>
        </div>
      </div>
    </Modal>
  );
}
export function SaveItemMethod({
  title,
  busy,
  onClose,
  onSave,
}: {
  title: string;
  busy: boolean;
  onClose: () => void;
  onSave: (title: string) => Promise<unknown>;
}) {
  const [name, setName] = useState(title),
    [error, setError] = useState('');
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="保存为可复用方法"
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          setError('');
          void onSave(name)
            .then(onClose)
            .catch((e) => setError(errorText(e)));
        }}
      >
        <label className="field">
          方法名称
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button variant="outline" type="button" onClick={onClose}>
            取消
          </Button>
          <Button variant="default" disabled={busy}>
            保存方法
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function SubmitItemEvent({
  itemId,
  eventName,
  onClose,
  onSaved,
}: {
  itemId: string;
  eventName: string;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const [name, setName] = useState(eventName),
    [payload, setPayload] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="提交等待事件"
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          void (async () => {
            await api(`/api/items/${itemId}/actions`, {
              action: 'signal',
              id: newId(),
              name,
              ...(payload.trim() ? { payload } : {}),
            });
            await onSaved();
            onClose();
          })()
            .catch((e) => setError(errorText(e)))
            .finally(() => setBusy(false));
        }}
      >
        <label className="field">
          事件
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="field">
          补充内容
          <Textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={3}
          />
        </label>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button variant="default" disabled={busy}>
            提交事件
          </Button>
        </div>
      </form>
    </Modal>
  );
}
export function CiteItemDelivery({
  item,
  source,
  onClose,
  onSaved,
  onConfigure,
}: {
  item: WorkItemView;
  source: OutputReference;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
  onConfigure: () => void;
}) {
  const [criterionId, setCriterionId] = useState(item.criteria[0]?.id || ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="加入完成依据"
    >
      <label className="field">
        完成条件
        <NativeSelect
          value={criterionId}
          onChange={(e) => setCriterionId(e.target.value)}
        >
          <option value="">选择条件</option>
          {item.criteria.map((c) => (
            <option key={c.id} value={c.id}>
              {c.text}
            </option>
          ))}
        </NativeSelect>
      </label>
      {!item.criteria.length && (
        <Button variant="outline" onClick={onConfigure}>
          设置完成条件
        </Button>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <Button
          disabled={busy || !criterionId}
          variant="default"
          onClick={() => {
            const criterion = item.criteria.find((c) => c.id === criterionId);
            if (!criterion) return;
            setBusy(true);
            setError('');
            void (async () => {
              const snapshot = await api<Snapshot>(
                `/api/works/${source.workId}?runIds=${source.runId}`,
              );
              const run = snapshot.work.runs.find((r) => r.id === source.runId);
              if (!run) throw Error('来源运行不可用');
              await api(`/api/items/${item.id}/actions`, {
                action: 'citeCriterion',
                criterionId,
                criterionText: criterion.text,
                reference: {
                  ...source,
                  definitionId: run.definitionId,
                  label: criterion.text,
                },
              });
              await onSaved();
              onClose();
            })()
              .catch((e) => setError(errorText(e)))
              .finally(() => setBusy(false));
          }}
        >
          加入依据
        </Button>
      </div>
    </Modal>
  );
}
