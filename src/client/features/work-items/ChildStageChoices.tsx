import { MaterialDialog } from '../../components/MaterialDialog';
import { useEffect, useState } from 'react';
import type {
  ChildStageInputs,
  Json,
  ItemInputSelection,
  OutputReference,
} from '../../../shared/records';
import { api } from '../../core/api';
import { dateTime, errorText, statusNames } from '../../core/format';
import { Badge, Button } from '../../components/ui';
import { NativeSelect } from '../../components/ui/native-select';
import './ChildStageChoices.css';

const sourceKey = (s: OutputReference) =>
  JSON.stringify([s.workId, s.runId, s.resultId, s.port, s.index]);

/** A fixed master/detail input picker; nothing is selected by recency. */
export function ChildStageChoices({
  itemId,
  selected,
  onChange,
  busy = false,
}: {
  itemId: string;
  selected: ItemInputSelection[];
  onChange: (selections: ItemInputSelection[]) => void;
  busy?: boolean;
}) {
  const [preview, setPreview] = useState<{ text: string; id: string }>();
  const [previewing, setPreviewing] = useState(false);
  const [data, setData] = useState<ChildStageInputs>();
  const [active, setActive] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [showIntermediate, setShowIntermediate] = useState(false);
  useEffect(() => {
    let live = true;
    api<ChildStageInputs>(`/api/items/${itemId}/actions`, {
      action: 'stageInputs',
    })
      .then((value) => {
        if (!live) return;
        setData(value);
        setError('');
        setActive((id) =>
          value.children.some((c) => c.id === id)
            ? id
            : value.children.find((c) => !c.excluded)?.id || '',
        );
      })
      .catch((e) => {
        if (live) setError(errorText(e));
      });
    return () => {
      live = false;
    };
  }, [itemId, retry]);
  const children = data?.children.filter((c) => !c.excluded) || [];
  const child = children.find((c) => c.id === active);
  const choices = selected.filter((s) => s.kind === 'child-results');
  const chosen = choices.find((s) => s.itemId === active)?.sources || [];
  const keys = new Set(chosen.map(sourceKey));
  const chosenChildren = children.filter((c) =>
    choices.some((s) => s.itemId === c.id && s.sources.length),
  );
  function changeSources(sources: OutputReference[]) {
    onChange([
      ...selected.filter(
        (s) => s.kind !== 'child-results' || s.itemId !== active,
      ),
      ...(sources.length
        ? [{ kind: 'child-results' as const, itemId: active, sources }]
        : []),
    ]);
  }
  async function showOutput(source: OutputReference) {
    setPreviewing(true);
    setError('');
    try {
      const result = await api<{ value: { outputs: { value: Json }[] } }>(
        `/api/items/${itemId}/actions`,
        {
          action: 'stagePreview',
          selection: {
            kind: 'child-results',
            itemId: active,
            sources: [source],
          },
        },
      );
      setPreview({
        id: '所选产物',
        text: JSON.stringify(result.value.outputs[0].value, null, 2),
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPreviewing(false);
    }
  }
  return (
    <section className="child-stage-picker" aria-label="选择子项阶段成果">
      <div className="child-stage-toolbar">
        <strong>子项阶段成果</strong>
        <span role="status">
          已选 {chosenChildren.length} / {children.length} 个子项 · 未选{' '}
          {children.length - chosenChildren.length} 项
        </span>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => setRetry((n) => n + 1)}
        >
          刷新可选成果
        </Button>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">正在读取子项成果…</p>}
      {data && (
        <>
          <div className="child-stage-grid">
            <nav className="child-stage-children" aria-label="选择子项">
              {children.map((c) => {
                const count =
                  choices.find((s) => s.itemId === c.id)?.sources.length || 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={active === c.id}
                    onClick={() => setActive(c.id)}
                  >
                    <strong>{c.title}</strong>
                    <small>
                      {count
                        ? `已选 ${count} 份产物`
                        : c.runs.length
                          ? `${c.runs.length} 轮可用 · 尚未选择`
                          : '暂无可用成果'}
                      {c.issues.length ? ' · 来源读取有误' : ''}
                    </small>
                  </button>
                );
              })}
              {!children.length && <p className="muted">暂无范围内子项</p>}
            </nav>
            <div className="child-stage-runs" aria-label="子项来源运行">
              {child && (
                <>
                  <div className="child-stage-detail-heading">
                    <strong>{child.title}</strong>
                    <label>
                      <input
                        type="checkbox"
                        checked={showIntermediate}
                        onChange={(e) => setShowIntermediate(e.target.checked)}
                      />{' '}
                      显示中间成果
                    </label>
                  </div>
                  <p className="muted">
                    选择具体运行的产物。续做仅覆盖部分目标时，可同时选择旧轮次中的有效成果。
                  </p>
                  {child.issues.map((issue) => (
                    <p className="inline-error" key={issue}>
                      {issue}
                    </p>
                  ))}
                  {child.runs.map((run) => {
                    const groups = run.groups.filter(
                      (g) =>
                        g.final ||
                        showIntermediate ||
                        g.outputs.some((o) => keys.has(sourceKey(o.source))),
                    );
                    const selectedGroups = run.groups.filter((g) =>
                      g.outputs.some((o) => keys.has(sourceKey(o.source))),
                    );
                    const selectedGroup = selectedGroups[0];
                    return (
                      <article
                        key={run.runId}
                        className="child-stage-run"
                        aria-label={`${run.title} ${dateTime(run.startedAt)}`}
                      >
                        <header>
                          <strong>
                            {run.title} · 第 {run.round} 轮
                          </strong>
                          <Badge status={run.status}>
                            {statusNames[run.status]}
                          </Badge>
                          <span>{dateTime(run.startedAt)}</span>
                        </header>
                        <label className="field">
                          使用本轮的哪组产物
                          <NativeSelect
                            value={
                              selectedGroup
                                ? `${selectedGroup.nodeId}:${selectedGroup.port}`
                                : ''
                            }
                            disabled={busy}
                            onChange={(e) => {
                              const group = run.groups.find(
                                (g) =>
                                  `${g.nodeId}:${g.port}` === e.target.value,
                              );
                              changeSources([
                                ...chosen.filter((s) => s.runId !== run.runId),
                                ...(group?.outputs.map((o) => o.source) || []),
                              ]);
                            }}
                          >
                            <option value="">不使用本轮</option>
                            {groups.map((g) => (
                              <option
                                key={`${g.nodeId}:${g.port}`}
                                value={`${g.nodeId}:${g.port}`}
                              >
                                {g.label} · {g.outputs.length} 份
                                {g.summary
                                  ? ' · 摘要'
                                  : g.final
                                    ? ' · 方法输出'
                                    : ' · 中间成果'}
                              </option>
                            ))}
                          </NativeSelect>
                        </label>
                        {!groups.length && (
                          <p className="muted">
                            本轮没有方法最终输出；可显示中间成果，选择已完成的部分。
                          </p>
                        )}
                        {selectedGroup && (
                          <div className="child-stage-outputs">
                            {selectedGroup.outputs.map((o, index) => (
                              <div
                                key={sourceKey(o.source)}
                                className="child-stage-output"
                              >
                                <label>
                                  <input
                                    type="checkbox"
                                    disabled={busy}
                                    checked={keys.has(sourceKey(o.source))}
                                    onChange={(e) =>
                                      changeSources(
                                        e.target.checked
                                          ? [...chosen, o.source]
                                          : chosen.filter(
                                              (s) =>
                                                sourceKey(s) !==
                                                sourceKey(o.source),
                                            ),
                                      )
                                    }
                                  />
                                  <span>
                                    <strong>
                                      产物 {index + 1}
                                      {o.entries !== undefined
                                        ? ` · 包含 ${o.entries} 条记录`
                                        : ''}
                                    </strong>
                                    <small title={o.preview}>{o.preview}</small>
                                  </span>
                                </label>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  disabled={previewing}
                                  onClick={() => void showOutput(o.source)}
                                >
                                  查看内容
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {!child.runs.length && (
                    <p className="muted">暂无已完成的正式运行产物</p>
                  )}
                </>
              )}
            </div>
          </div>
          <p className="child-stage-footnote">
            每个子项作为一项输入，包含业务身份与所选产物原值、来源。未选子项不进入本轮；选择成果不确认结项。
            {data.children.some((c) => c.excluded)
              ? ` 已排除 ${data.children.filter((c) => c.excluded).length} 个子项。`
              : ''}
          </p>
        </>
      )}
      <MaterialDialog
        material={preview}
        open={!!preview}
        onOpenChange={(open) => {
          if (!open) setPreview(undefined);
        }}
      />
    </section>
  );
}
