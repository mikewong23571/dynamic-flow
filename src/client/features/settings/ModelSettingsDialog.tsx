import { useEffect, useState } from 'react';
import { Check, LoaderCircle, Settings2 } from 'lucide-react';
import type {
  ModelConfiguration,
  ModelSettings,
} from '../../../shared/records';
import { api } from '../../core/api';
import { runAction } from '../../core/action';
import { errorText } from '../../core/format';
import { Badge, Button, Modal } from '../../components/ui';
export const reasoningLabels: Record<ModelSettings['reasoningEffort'], string> =
  { low: '较低', medium: '中等', high: '较高', max: '最高' };
const protocolLabels: Record<ModelSettings['protocol'], string> = {
  'anthropic-messages': 'Anthropic Messages',
  'openai-chat-completions': 'OpenAI Chat Completions',
  'openai-responses': 'OpenAI Responses',
};
const defaults: ModelSettings = {
  protocol: 'anthropic-messages',
  baseUrl: '',
  model: '',
  reasoningEffort: 'max',
  temperature: 1,
  topP: 0.95,
  contextWindow: 1000000,
};
function toForm(config: ModelConfiguration | null): ModelSettings {
  return {
    ...defaults,
    ...(config
      ? {
          protocol: config.protocol || defaults.protocol,
          baseUrl: config.baseUrl || '',
          model: config.model || '',
          reasoningEffort: config.reasoningEffort || defaults.reasoningEffort,
          temperature: config.temperature ?? defaults.temperature,
          topP: config.topP ?? defaults.topP,
          contextWindow: config.contextWindow ?? defaults.contextWindow,
        }
      : {}),
    apiKey: '',
  };
}
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
  const [form, setForm] = useState<ModelSettings>(() => toForm(configuration));
  const [current, setCurrent] = useState(configuration);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!open) {
      setForm((f) => ({ ...f, apiKey: '' }));
      return;
    }
    let live = true;
    setSaved(false);
    setError('');
    setForm(toForm(configuration));
    setCurrent(configuration);
    void api<ModelConfiguration>('/api/config')
      .then((config) => {
        if (live) {
          setCurrent(config);
          setForm(toForm(config));
        }
      })
      .catch((e) => {
        if (live) setError(errorText(e));
      });
    return () => {
      live = false;
    };
  }, [open]);
  const update = (patch: Partial<ModelSettings>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  };
  async function save() {
    await runAction(
      async () => {
        const result = await api<ModelConfiguration>('/api/config', {
          ...form,
          apiKey: form.apiKey?.trim() || undefined,
        });
        setCurrent(result);
        setForm(toForm(result));
        setSaved(true);
        onSaved(result);
      },
      { setBusy, setError },
    );
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="模型设置"
      description="用于生成做法和执行 Agent 步骤。保存后用于新的请求。"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="model-settings"
      >
        <div className="settings-topline">
          <span>
            <Settings2 size={15} />
            {current?.source === 'workspace' ? '工作台配置' : '初始配置'}
          </span>
          <Badge status={current?.ready ? 'completed' : 'failed'}>
            {current?.ready ? '模型已配置' : '需要配置'}
          </Badge>
        </div>
        <label className="field">
          服务协议
          <select
            aria-label="服务协议"
            value={form.protocol}
            onChange={(e) =>
              update({ protocol: e.target.value as ModelSettings['protocol'] })
            }
          >
            {Object.entries(protocolLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          服务地址
          <input
            type="url"
            aria-label="服务地址"
            required
            value={form.baseUrl}
            onChange={(e) => update({ baseUrl: e.target.value })}
            placeholder="https://api.example.com"
          />
        </label>
        <div className="settings-grid">
          <label className="field">
            模型名称
            <input
              required
              aria-label="模型名称"
              value={form.model}
              onChange={(e) => update({ model: e.target.value })}
              placeholder="服务提供的模型名称"
            />
          </label>
          <label className="field">
            推理强度
            <select
              aria-label="推理强度"
              value={form.reasoningEffort}
              onChange={(e) =>
                update({
                  reasoningEffort: e.target
                    .value as ModelSettings['reasoningEffort'],
                })
              }
            >
              {Object.entries(reasoningLabels).map(([value, label]) => (
                <option
                  key={value}
                  value={value}
                  disabled={
                    current?.protocol === form.protocol &&
                    !!current.supportedReasoningEfforts &&
                    !current.supportedReasoningEfforts.includes(
                      value as ModelSettings['reasoningEffort'],
                    )
                  }
                >
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          API 密钥{' '}
          <span className="field-note">
            {current?.apiKeyConfigured
              ? '已配置，留空沿用现有密钥'
              : '尚未配置'}
          </span>
          <input
            type="password"
            aria-label="API 密钥"
            autoComplete="new-password"
            value={form.apiKey || ''}
            onChange={(e) => update({ apiKey: e.target.value })}
            placeholder={
              current?.apiKeyConfigured ? '输入新密钥以替换' : '输入 API 密钥'
            }
          />
        </label>
        <div className="settings-divider">生成参数</div>
        <div className="settings-grid">
          <label className="field">
            随机程度（Temperature）
            <input
              type="number"
              aria-label="随机程度"
              min="0"
              max="2"
              step="0.05"
              required
              value={form.temperature}
              onChange={(e) => update({ temperature: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            采样范围（Top P）
            <input
              type="number"
              aria-label="采样范围"
              min="0"
              max="1"
              step="0.01"
              required
              value={form.topP}
              onChange={(e) => update({ topP: Number(e.target.value) })}
            />
          </label>
        </div>
        <label className="field">
          上下文窗口（token）
          <input
            type="number"
            aria-label="上下文窗口"
            min="1"
            step="1"
            required
            value={form.contextWindow}
            onChange={(e) => update({ contextWindow: Number(e.target.value) })}
          />
        </label>
        {current?.protocol === form.protocol && !!current.warnings?.length && (
          <details className="details">
            <summary>协议说明</summary>
            {current.warnings.map((warning, i) => (
              <p className="settings-warning" key={i}>
                {warning}
              </p>
            ))}
          </details>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="settings-saved" role="status">
            <Check size={15} />
            模型配置已保存
          </p>
        )}
        <div className="modal-actions">
          <Button type="button" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Check size={15} />
            )}
            保存配置
          </Button>
        </div>
      </form>
    </Modal>
  );
}
