import type {
  EffectiveModel,
  ModelCatalogEntry,
  ModelConfiguration,
  ModelSelection,
  ModelSettings,
  ReasoningEffort,
} from '../../../shared/records';

export type Effort = ReasoningEffort;
/** 思考级别词表（与运行时对齐）；空集合 = 不设置思考级别。 */
export const efforts: Effort[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];
/** 级别展示与配置值一致，统一英文。 */
export const effortLabels: Record<Effort, string> = {
  off: 'off',
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max',
};
export type ProviderType = 'anthropic' | 'openai' | 'openai-responses';
export const providerTypes: Record<ProviderType, string> = {
  anthropic: 'Anthropic Messages',
  openai: 'OpenAI Chat Completions',
  'openai-responses': 'OpenAI Responses',
};
const typeFromProtocol: Record<ModelSettings['protocol'], ProviderType> = {
  'anthropic-messages': 'anthropic',
  'openai-chat-completions': 'openai',
  'openai-responses': 'openai-responses',
};

/** PUT /api/config/catalog 的提交形状（对应服务端 CatalogInput）。 */
export interface CatalogPayload {
  providers: {
    name: string;
    type: ProviderType;
    baseUrl: string;
    apiKey?: string;
    headers?: Record<string, string>;
  }[];
  models: {
    alias: string;
    provider: string;
    model: string;
    displayName?: string;
    contextWindow: number;
    /** 显式空数组 = 不设置思考级别；省略 = 服务端默认档位。 */
    supportedEfforts?: Effort[];
    defaultEffort?: Effort;
  }[];
}

export interface ProviderDraft {
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey: string;
  headers: { key: string; value: string }[];
  /** 用户是否动过请求头编辑区；未动则保存时沿用服务端旧值。 */
  headersTouched: boolean;
  isNew: boolean;
}
export interface ModelDraft {
  alias: string;
  provider: string;
  model: string;
  displayName: string;
  contextWindow: number;
  /** 勾选的级别集合；空 = 不设置思考级别。off = 允许运行时选择不思考。 */
  supportedEfforts: Effort[];
  defaultEffort: Effort | '';
  /** 编辑器内折叠态；新增模型默认展开。 */
  collapsed: boolean;
  isNew: boolean;
}

export function providerDrafts(
  configuration: ModelConfiguration | null,
): ProviderDraft[] {
  return (configuration?.catalogProviders ?? []).map((provider) => ({
    name: provider.name,
    type: typeFromProtocol[provider.protocol],
    baseUrl: provider.baseUrl,
    apiKey: '',
    headers: [],
    headersTouched: false,
    isNew: false,
  }));
}
export function modelDrafts(configuration: ModelConfiguration | null) {
  return (configuration?.catalog ?? []).map((entry) => ({
    alias: entry.alias,
    provider: entry.provider,
    model: entry.model,
    displayName: entry.displayName,
    contextWindow: entry.contextWindow,
    supportedEfforts: [...entry.supportedEfforts],
    defaultEffort: entry.defaultEffort ?? ('' as const),
    collapsed: true,
    isNew: false,
  }));
}

export function toPayload(
  providers: ProviderDraft[],
  models: ModelDraft[],
): CatalogPayload {
  return {
    providers: providers.map((provider) => ({
      name: provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey.trim() || undefined,
      ...(provider.headersTouched
        ? {
            headers: Object.fromEntries(
              provider.headers
                .filter((row) => row.key.trim())
                .map((row) => [row.key.trim(), row.value]),
            ),
          }
        : {}),
    })),
    models: models.map((model) => ({
      alias: model.alias,
      provider: model.provider,
      model: model.model,
      displayName: model.displayName.trim() || undefined,
      contextWindow: model.contextWindow,
      supportedEfforts: [...model.supportedEfforts],
      defaultEffort: model.defaultEffort || undefined,
    })),
  };
}

/**
 * 把 provider 编辑器的改动合并回目录草稿。
 * 编辑器里的模型行属于当前 provider；新建时名称是后填的，合并时统一归属。
 */
export function mergeEdited(
  providers: ProviderDraft[],
  models: ModelDraft[],
  original: string,
  provider: ProviderDraft,
  edited: ModelDraft[],
): { providers: ProviderDraft[]; models: ModelDraft[] } {
  return {
    providers: original
      ? providers.map((item) => (item.name === original ? provider : item))
      : [...providers, provider],
    models: [
      ...models.filter((model) =>
        original ? model.provider !== original : true,
      ),
      ...edited
        .filter((model) => model.model.trim())
        .map((model) => ({ ...model, provider: provider.name })),
    ],
  };
}

export function effortOptions(
  entry: ModelCatalogEntry,
): { id: Effort; name: string }[] {
  return entry.supportedEfforts.map((id) => ({ id, name: effortLabels[id] }));
}

export const resolvedSourceLabels = {
  catalog: '模型目录',
  none: '尚未配置',
} as const;

const effectiveSourceLabels = {
  work: '本工作覆盖',
  default: '跟随默认',
} as const;

/** 生效披露小字，如「Sonnet · high · 跟随默认」。 */
export function effectiveModelLabel(
  effective: EffectiveModel,
  catalog?: ModelCatalogEntry[],
): string {
  const entry = effective.alias
    ? catalog?.find((e) => e.alias === effective.alias)
    : undefined;
  const name = entry?.displayName || effective.alias || effective.model;
  const parts = [name];
  if (effective.effort) parts.push(effortLabels[effective.effort]);
  parts.push(effectiveSourceLabels[effective.source] ?? effective.source);
  return parts.join(' · ');
}
