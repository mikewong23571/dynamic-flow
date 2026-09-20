import { useEffect, useState } from 'react';
import { Check, LoaderCircle, Settings2 } from 'lucide-react';
import type {
  ModelConfiguration,
  ModelSelection,
  ModelSettings,
} from '../../../shared/records';
import { api } from '../../core/api';
import { runAction } from '../../core/action';
import { errorText } from '../../core/format';
import { Badge, Modal } from '../../components/ui';
import { CatalogManager } from './CatalogManager';
import { effortLabels } from './catalog-model';
export const reasoningLabels = effortLabels;

/** 模型设置 = 全局默认选择（改完即存）+ 模型目录管理；models.toml 是唯一配置来源。 */
export function ModelSettingsDialog({
  open,
  onOpenChange,
  configuration,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  configuration: ModelConfiguration | null;
  onSaved: (c: ModelConfiguration) => void;
}) {
  const [current, setCurrent] = useState(configuration);
  const [defaultAlias, setDefaultAlias] = useState('');
  const [defaultEffort, setDefaultEffort] =
    useState<ModelSettings['reasoningEffort']>('medium');
  const [defaultSaved, setDefaultSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    let live = true;
    setDefaultSaved(false);
    setError('');
    const apply = (config: ModelConfiguration | null) => {
      setCurrent(config);
      setDefaultAlias(config?.defaultSelection?.alias ?? '');
      setDefaultEffort(
        config?.defaultSelection?.effort ??
          config?.catalog?.find(
            (entry) => entry.alias === config.defaultSelection?.alias,
          )?.defaultEffort ??
          'medium',
      );
    };
    apply(configuration);
    void api<ModelConfiguration>('/api/config')
      .then((config) => {
        if (live) apply(config);
      })
      .catch((e) => {
        if (live) setError(errorText(e));
      });
    return () => {
      live = false;
    };
  }, [open]);
  /** 默认模型是偏好切换：改完即存，与目录表单的显式保存区分。 */
  async function applyDefault(
    alias: string,
    effort: ModelSettings['reasoningEffort'],
  ) {
    setDefaultAlias(alias);
    setDefaultEffort(effort);
    setDefaultSaved(false);
    if (!alias && !current?.defaultSelection) return;
    await runAction(
      async () => {
        const selection: ModelSelection | null = alias
          ? { alias, effort }
          : null;
        const result = await api<ModelConfiguration>(
          '/api/config/default',
          { selection },
          'PUT',
        );
        setCurrent(result);
        onSaved(result);
        setDefaultSaved(true);
      },
      { setBusy, setError },
    );
  }
  const defaultEntry = current?.catalog?.find(
    (entry) => entry.alias === defaultAlias,
  );
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="模型设置"
      description="选择默认模型并管理模型目录（models.toml）；用于新的请求。"
    >
      <div className="model-settings">
        <div className="settings-topline">
          <span>
            <Settings2 size={15} />
            模型目录
          </span>
          <Badge status={current?.ready ? 'completed' : 'failed'}>
            {current?.ready ? '模型已配置' : '需要配置'}
          </Badge>
        </div>
        {current?.error &&
          !(
            current.error.includes('尚未选择默认模型') &&
            (current.catalog?.length ?? 0) === 0
          ) && (
            <p className="inline-error" role="alert">
              {current.error}
            </p>
          )}
        <div className="settings-grid">
          <label className="field">
            默认模型
            <select
              aria-label="默认模型"
              value={defaultAlias}
              disabled={busy}
              onChange={(e) => {
                const alias = e.target.value;
                void applyDefault(
                  alias,
                  current?.catalog?.find((entry) => entry.alias === alias)
                    ?.defaultEffort ?? 'medium',
                );
              }}
            >
              <option value="">未选择</option>
              {(current?.catalog ?? []).map((entry) => (
                <option key={entry.alias} value={entry.alias}>
                  {entry.displayName}（{entry.alias}）
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Reasoning effort
            <select
              aria-label="默认推理强度"
              value={defaultEffort}
              disabled={busy || !defaultEntry}
              onChange={(e) =>
                void applyDefault(
                  defaultAlias,
                  e.target.value as ModelSettings['reasoningEffort'],
                )
              }
            >
              {!defaultEntry && <option value={defaultEffort}>—</option>}
              {(defaultEntry?.supportedEfforts ?? []).map((effort) => (
                <option key={effort} value={effort}>
                  {reasoningLabels[effort]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted settings-hint">
          <span>作用于全部调用（含流程执行）；对话里可按工作覆盖。</span>
          {busy && <LoaderCircle size={13} className="spin" />}
          {defaultSaved && !busy && (
            <span className="settings-saved" role="status">
              <Check size={13} />
              已保存
            </span>
          )}
        </p>
        <CatalogManager
          configuration={current}
          onSaved={(config) => {
            setCurrent(config);
            onSaved(config);
          }}
        />
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
