import { useEffect, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  Plug,
  Plus,
  Trash2,
} from 'lucide-react';
import type {
  ModelCatalogEntry,
  ModelConfiguration,
} from '../../../shared/records';
import { api } from '../../core/api';
import { runAction } from '../../core/action';
import { errorText } from '../../core/format';
import { Badge, Button } from '../../components/ui';
import {
  effortLabels,
  efforts,
  mergeEdited,
  modelDrafts,
  providerDrafts,
  providerTypes,
  toPayload,
  type ModelDraft,
  type ProviderDraft,
} from './catalog-model';

type TestState = Record<
  string,
  { ok: boolean; latencyMs: number; error?: string } | 'running'
>;

const emptyProvider = (): ProviderDraft => ({
  name: '',
  type: 'anthropic',
  baseUrl: '',
  apiKey: '',
  headers: [],
  headersTouched: false,
  isNew: true,
});
const emptyModel = (provider: string): ModelDraft => ({
  alias: provider ? `${provider}/` : '',
  provider,
  model: '',
  displayName: '',
  contextWindow: 128000,
  supportedEfforts: ['low', 'medium', 'high', 'max'],
  defaultEffort: 'medium',
  collapsed: false,
  isNew: true,
});

/**
 * Provider 与模型的目录管理：卡片就地展开编辑（不离开列表上下文），
 * 一张卡片一次显式保存；删除两步确认；保存即整份校验后原子重写 models.toml。
 */
export function CatalogManager({
  configuration,
  onSaved,
}: {
  configuration: ModelConfiguration | null;
  onSaved: (c: ModelConfiguration) => void;
}) {
  const [providers, setProviders] = useState<ProviderDraft[]>([]);
  const [models, setModels] = useState<ModelDraft[]>([]);
  const [editing, setEditing] = useState<{
    original: string;
    provider: ProviderDraft;
    models: ModelDraft[];
  } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tests, setTests] = useState<TestState>({});
  const catalogKey = JSON.stringify([
    configuration?.catalogProviders ?? null,
    configuration?.catalog ?? null,
  ]);
  useEffect(() => {
    setProviders(providerDrafts(configuration));
    setModels(modelDrafts(configuration));
    setConfirming(null);
  }, [catalogKey]);

  async function persist(
    nextProviders: ProviderDraft[],
    nextModels: ModelDraft[],
  ) {
    return Boolean(
      await runAction(
        async () => {
          const result = await api<ModelConfiguration>(
            '/api/config/catalog',
            toPayload(nextProviders, nextModels),
            'PUT',
          );
          onSaved(result);
          return true;
        },
        { setBusy, setError },
      ),
    );
  }
  async function removeProvider(name: string) {
    setConfirming(null);
    await persist(
      providers.filter((provider) => provider.name !== name),
      models.filter((model) => model.provider !== name),
    );
  }
  async function removeModel(alias: string) {
    setConfirming(null);
    await persist(
      providers,
      models.filter((model) => model.alias !== alias),
    );
  }
  async function test(alias: string) {
    setTests((prev) => ({ ...prev, [alias]: 'running' }));
    try {
      const result = await api<{
        ok: boolean;
        latencyMs: number;
        error?: string;
      }>('/api/config/test', { alias });
      setTests((prev) => ({ ...prev, [alias]: result }));
    } catch (error) {
      setTests((prev) => ({
        ...prev,
        [alias]: { ok: false, latencyMs: 0, error: errorText(error) },
      }));
    }
  }
  function openEditor(name: string | null) {
    setError('');
    setConfirming(null);
    if (name === null) {
      setEditing({
        original: '',
        provider: emptyProvider(),
        models: [emptyModel('')],
      });
      return;
    }
    const provider = providers.find((provider) => provider.name === name);
    if (!provider) return;
    setEditing({
      original: name,
      provider: { ...provider, headers: [...provider.headers] },
      models: models
        .filter((model) => model.provider === name)
        .map((model) => ({ ...model })),
    });
  }
  async function saveEditor() {
    if (!editing) return;
    const { original, provider, models: edited } = editing;
    const next = mergeEdited(providers, models, original, provider, edited);
    if (await persist(next.providers, next.models)) setEditing(null);
  }
  const updateProvider = (patch: Partial<ProviderDraft>) =>
    setEditing((prev) =>
      prev
        ? {
            ...prev,
            provider: { ...prev.provider, ...patch },
          }
        : prev,
    );
  const updateModel = (index: number, patch: Partial<ModelDraft>) =>
    setEditing((prev) =>
      prev
        ? {
            ...prev,
            models: prev.models.map((model, i) =>
              i === index ? { ...model, ...patch } : model,
            ),
          }
        : prev,
    );
  const catalog = configuration?.catalog ?? [];
  const dirty =
    JSON.stringify(providers) !==
      JSON.stringify(providerDrafts(configuration)) ||
    JSON.stringify(models) !== JSON.stringify(modelDrafts(configuration));

  function providerEditor(title: string) {
    if (!editing) return null;
    const { provider, models: edited } = editing;
    return (
      <form
        className="catalog-provider catalog-editor"
        onSubmit={(event) => {
          event.preventDefault();
          void saveEditor();
        }}
      >
        <header>
          <strong>{title}</strong>
        </header>
        <div className="settings-grid">
          <label className="field">
            Provider 名称
            <input
              required
              aria-label="Provider 名称"
              value={provider.name}
              readOnly={!provider.isNew}
              onChange={(e) => updateProvider({ name: e.target.value.trim() })}
              placeholder="例如 acme"
            />
          </label>
          <label className="field">
            协议类型
            <select
              aria-label="协议类型"
              value={provider.type}
              onChange={(e) =>
                updateProvider({
                  type: e.target.value as ProviderDraft['type'],
                })
              }
            >
              {Object.entries(providerTypes).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="settings-row">
          <label className="field">
            服务地址
            <input
              type="url"
              required
              aria-label="服务地址"
              value={provider.baseUrl}
              onChange={(e) => updateProvider({ baseUrl: e.target.value })}
              placeholder="https://api.example.com"
            />
          </label>
        </div>
        <div className="settings-row">
          <label className="field">
            <span>
              API 密钥{' '}
              <span className="field-note">
                {provider.isNew ? '必填' : '留空沿用'}
              </span>
            </span>
            <input
              type="password"
              aria-label="API 密钥"
              autoComplete="new-password"
              required={provider.isNew}
              value={provider.apiKey}
              onChange={(e) => updateProvider({ apiKey: e.target.value })}
              placeholder={
                provider.isNew ? '输入 API 密钥' : '输入新密钥以替换'
              }
            />
          </label>
        </div>
        <div className="settings-divider">
          自定义请求头（custom_headers）
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              updateProvider({
                headers: [...provider.headers, { key: '', value: '' }],
                headersTouched: true,
              })
            }
          >
            <Plus size={13} />
            添加
          </Button>
        </div>
        {provider.headers.map((row, index) => (
          <div className="settings-grid settings-grid-headers" key={index}>
            <label className="field">
              请求头名称
              <input
                aria-label={`请求头名称 ${index + 1}`}
                value={row.key}
                onChange={(e) =>
                  updateProvider({
                    headers: provider.headers.map((item, i) =>
                      i === index ? { ...item, key: e.target.value } : item,
                    ),
                    headersTouched: true,
                  })
                }
                placeholder="X-Custom-Header"
              />
            </label>
            <label className="field">
              请求头内容
              <input
                aria-label={`请求头内容 ${index + 1}`}
                value={row.value}
                onChange={(e) =>
                  updateProvider({
                    headers: provider.headers.map((item, i) =>
                      i === index ? { ...item, value: e.target.value } : item,
                    ),
                    headersTouched: true,
                  })
                }
              />
            </label>
            <div className="settings-grid-action">
              <Button
                type="button"
                variant="ghost"
                aria-label={`移除请求头 ${index + 1}`}
                onClick={() =>
                  updateProvider({
                    headers: provider.headers.filter((_, i) => i !== index),
                    headersTouched: true,
                  })
                }
              >
                <Trash2 size={13} />
              </Button>
            </div>
          </div>
        ))}
        <div className="settings-divider">
          模型
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              setEditing((prev) =>
                prev
                  ? {
                      ...prev,
                      models: [...prev.models, emptyModel(provider.name)],
                    }
                  : prev,
              )
            }
          >
            <Plus size={13} />
            新增模型
          </Button>
        </div>
        {edited.map((model, index) => {
          const title = model.alias.trim() || `新模型 ${index + 1}`;
          return (
            <div className="catalog-model-editor" key={index}>
              <div className="catalog-model-editor-head">
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`切换模型展开 ${index + 1}`}
                  onClick={() =>
                    updateModel(index, { collapsed: !model.collapsed })
                  }
                >
                  {model.collapsed ? (
                    <ChevronRight size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </Button>
                <span className="catalog-model-editor-title">
                  <strong>{title}</strong>{' '}
                  {model.displayName && (
                    <span className="muted">{model.displayName}</span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`移除模型 ${index + 1}`}
                  onClick={() =>
                    setEditing((prev) =>
                      prev
                        ? {
                            ...prev,
                            models: prev.models.filter((_, i) => i !== index),
                          }
                        : prev,
                    )
                  }
                >
                  <Trash2 size={13} />
                </Button>
              </div>
              {!model.collapsed && (
                <>
                  <div className="settings-grid">
                    <label className="field">
                      别名
                      <input
                        required
                        aria-label={`模型别名 ${index + 1}`}
                        value={model.alias}
                        readOnly={!model.isNew}
                        onChange={(e) =>
                          updateModel(index, { alias: e.target.value.trim() })
                        }
                        placeholder="provider/模型"
                      />
                    </label>
                    <label className="field">
                      模型 ID
                      <input
                        required
                        aria-label={`模型 ID ${index + 1}`}
                        value={model.model}
                        onChange={(e) =>
                          updateModel(index, { model: e.target.value })
                        }
                        placeholder="发给服务的模型名"
                      />
                    </label>
                  </div>
                  <div className="settings-grid">
                    <label className="field">
                      显示名
                      <input
                        aria-label={`显示名 ${index + 1}`}
                        value={model.displayName}
                        onChange={(e) =>
                          updateModel(index, { displayName: e.target.value })
                        }
                        placeholder="留空用模型 ID"
                      />
                    </label>
                    <label className="field">
                      上下文窗口
                      <input
                        type="number"
                        required
                        min="8192"
                        max="2000000"
                        step="1"
                        aria-label={`上下文窗口 ${index + 1}`}
                        value={model.contextWindow}
                        onChange={(e) =>
                          updateModel(index, {
                            contextWindow: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <div className="settings-row">
                    <div className="field">
                      <span>Thinking efforts</span>
                      <div className="effort-checks">
                        {efforts.map((effort) => (
                          <label className="check-row" key={effort}>
                            <input
                              type="checkbox"
                              aria-label={`${effort} ${index + 1}`}
                              checked={model.supportedEfforts.includes(effort)}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? efforts.filter((item) =>
                                      [
                                        ...model.supportedEfforts,
                                        effort,
                                      ].includes(item),
                                    )
                                  : model.supportedEfforts.filter(
                                      (item) => item !== effort,
                                    );
                                updateModel(index, {
                                  supportedEfforts: next,
                                  ...(model.defaultEffort &&
                                  !next.includes(model.defaultEffort)
                                    ? { defaultEffort: next[0] ?? '' }
                                    : {}),
                                });
                              }}
                            />
                            {effortLabels[effort]}
                          </label>
                        ))}
                      </div>
                      <span className="field-note">
                        全不选 = 不设置思考级别；勾选 off = 允许运行时选择不思考
                      </span>
                    </div>
                  </div>
                  <div className="settings-row">
                    <label className="field">
                      Default effort
                      <select
                        aria-label={`Default effort ${index + 1}`}
                        value={model.defaultEffort}
                        disabled={!model.supportedEfforts.length}
                        onChange={(e) =>
                          updateModel(index, {
                            defaultEffort: e.target
                              .value as ModelDraft['defaultEffort'],
                          })
                        }
                      >
                        {(!model.supportedEfforts.length ||
                          !model.defaultEffort) && (
                          <option value="">
                            {model.supportedEfforts.length
                              ? '—'
                              : '—（不设置）'}
                          </option>
                        )}
                        {model.supportedEfforts.map((effort) => (
                          <option key={effort} value={effort}>
                            {effortLabels[effort]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </>
              )}
            </div>
          );
        })}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button type="button" onClick={() => setEditing(null)}>
            取消
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Check size={15} />
            )}
            保存目录
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="catalog-manager">
      <div className="settings-divider">
        Provider 与模型
        <Button
          variant="ghost"
          disabled={!!editing}
          onClick={() => openEditor(null)}
        >
          <Plus size={13} />
          新增 Provider
        </Button>
      </div>
      {providers.length === 0 && !editing && (
        <p className="muted">
          还没有模型目录。新增 Provider 后可在默认模型和对话中选择。
        </p>
      )}
      {providers.map((provider) => {
        if (editing?.original === provider.name)
          return (
            <div key={provider.name}>
              {providerEditor(`编辑 ${provider.name}`)}
            </div>
          );
        const entries = catalog.filter(
          (entry) => entry.provider === provider.name,
        );
        const serverProvider = configuration?.catalogProviders?.find(
          (item) => item.name === provider.name,
        );
        return (
          <div className="catalog-provider" key={provider.name}>
            <header>
              <strong>{provider.name}</strong>
              <span
                className="muted catalog-provider-url"
                title={provider.baseUrl}
              >
                {providerTypes[provider.type]} · {provider.baseUrl}
              </span>
              <Badge
                status={
                  serverProvider?.apiKeyConfigured ? 'completed' : 'failed'
                }
              >
                {serverProvider?.apiKeyConfigured ? '密钥已配置' : '缺少密钥'}
              </Badge>
              {serverProvider?.headersConfigured && <Badge>自定义请求头</Badge>}
              <span className="catalog-provider-actions">
                <Button
                  variant="ghost"
                  disabled={!!editing}
                  onClick={() => openEditor(provider.name)}
                >
                  编辑
                </Button>
                {confirming === `provider:${provider.name}` ? (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void removeProvider(provider.name)}
                  >
                    确认删除
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    disabled={busy || !!editing}
                    onClick={() => setConfirming(`provider:${provider.name}`)}
                  >
                    删除
                  </Button>
                )}
              </span>
            </header>
            {entries.map((entry) => (
              <div className="catalog-model" key={entry.alias}>
                <span>
                  <strong>{entry.displayName}</strong>{' '}
                  <span className="muted">
                    {entry.alias} · {entry.model}
                  </span>
                </span>
                <span className="catalog-model-actions">
                  {tests[entry.alias] === 'running' ? (
                    <span className="muted">
                      <LoaderCircle size={13} className="spin" /> 测试中…
                    </span>
                  ) : tests[entry.alias] ? (
                    (tests[entry.alias] as { ok: boolean }).ok ? (
                      <span className="catalog-test-ok">
                        通过（
                        {
                          (tests[entry.alias] as { latencyMs: number })
                            .latencyMs
                        }
                        ms）
                      </span>
                    ) : (
                      <span className="error-text">
                        {(tests[entry.alias] as { error?: string }).error}
                      </span>
                    )
                  ) : null}
                  <Button
                    variant="ghost"
                    aria-label={`测试 ${entry.alias}`}
                    disabled={busy || tests[entry.alias] === 'running' || dirty}
                    onClick={() => void test(entry.alias)}
                  >
                    <Plug size={13} />
                    测试
                  </Button>
                  {confirming === `model:${entry.alias}` ? (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void removeModel(entry.alias)}
                    >
                      确认删除
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      disabled={busy || !!editing}
                      onClick={() => setConfirming(`model:${entry.alias}`)}
                    >
                      删除
                    </Button>
                  )}
                </span>
              </div>
            ))}
          </div>
        );
      })}
      {editing?.original === '' && providerEditor('新增 Provider')}
      {dirty && !editing && (
        <p className="muted">有未保存的目录修改；保存后才能测试连接。</p>
      )}
      {error && !editing && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
