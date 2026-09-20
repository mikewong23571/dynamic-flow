import { readFileSync } from 'node:fs';
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse, stringify } from 'smol-toml';
import type {
  ModelCatalogEntry,
  ModelCatalogProvider,
  ModelSelection,
  ModelSettings,
} from '../../shared/records.ts';
import type { ModelConfig } from './config.ts';
import { modelDefaults, publicProtocol } from './settings.ts';

type Effort = ModelSettings['reasoningEffort'];
/**
 * 思考级别词表与运行时（pi thinkingLevel）对齐，覆盖主流模型的取值：
 * OpenAI none/minimal/low/medium/high/xhigh/max（none 以 off 表示）、Claude low–max、Kimi/GLM low/high/max。
 * support_efforts 为空数组表示该模型不设置思考级别。
 */
const efforts: Effort[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];
/** 未显式配置 support_efforts 时的默认档位。 */
const defaultEfforts: Effort[] = ['low', 'medium', 'high', 'max'];

/** provider type → 内部协议名；oauth/managed（如 kimi）不支持，加载时明确报错。 */
const providerTypes = {
  anthropic: 'anthropic-messages',
  openai: 'openai-completions',
  'openai-responses': 'openai-responses',
} as const;
type ProviderType = keyof typeof providerTypes;

/** 目录内部条目（含密钥与请求头），不离开服务端。 */
export interface CatalogProvider {
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
}
export interface CatalogModel {
  alias: string;
  provider: string;
  model: string;
  displayName: string;
  contextWindow: number;
  /** 空数组 = 不设置思考级别。 */
  supportedEfforts: Effort[];
  defaultEffort?: Effort;
}
export interface ModelCatalog {
  providers: CatalogProvider[];
  models: CatalogModel[];
}
/** 界面整份编辑提交的形状；apiKey 留空表示沿用已保存密钥。 */
export interface CatalogInput {
  providers: {
    name: string;
    type: string;
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
    supportedEfforts?: Effort[];
    defaultEffort?: Effort;
  }[];
}

function checkProvider(provider: CatalogProvider): void {
  if (!provider.name.trim()) throw new Error('目录中存在没有名称的 provider。');
  if (!(provider.type in providerTypes))
    throw new Error(
      `目录 provider「${provider.name}」的类型「${provider.type}」不受支持，请使用 anthropic、openai 或 openai-responses。`,
    );
  let url: URL;
  try {
    url = new URL(provider.baseUrl);
  } catch {
    throw new Error(
      `目录 provider「${provider.name}」的 base_url 不是有效网址。`,
    );
  }
  if (!['https:', 'http:'].includes(url.protocol))
    throw new Error(
      `目录 provider「${provider.name}」的 base_url 需要 HTTP 或 HTTPS。`,
    );
  if (!provider.apiKey.trim())
    throw new Error(`目录 provider「${provider.name}」缺少 API Key。`);
}
function checkModel(model: CatalogModel, providers: Set<string>): void {
  if (!model.alias.trim()) throw new Error('目录中存在没有别名的模型条目。');
  if (!providers.has(model.provider))
    throw new Error(
      `目录模型「${model.alias}」引用了不存在的 provider「${model.provider}」。`,
    );
  if (!model.model.trim())
    throw new Error(`目录模型「${model.alias}」缺少模型名称。`);
  if (
    !Number.isInteger(model.contextWindow) ||
    model.contextWindow < 8192 ||
    model.contextWindow > 2000000
  )
    throw new Error(
      `目录模型「${model.alias}」的 max_context_size 需要是 8192 到 2000000 之间的整数。`,
    );
  for (const effort of model.supportedEfforts)
    if (!efforts.includes(effort))
      throw new Error(
        `目录模型「${model.alias}」的思考级别「${effort}」无效，只支持 off、minimal、low、medium、high、xhigh、max。`,
      );
  if (
    model.defaultEffort !== undefined &&
    !model.supportedEfforts.includes(model.defaultEffort)
  )
    throw new Error(
      `目录模型「${model.alias}」的 default_effort 不在 support_efforts 中。`,
    );
}
export function validateCatalog(catalog: ModelCatalog): void {
  const names = new Set<string>();
  for (const provider of catalog.providers) {
    checkProvider(provider);
    if (names.has(provider.name))
      throw new Error(`目录 provider「${provider.name}」重复。`);
    names.add(provider.name);
  }
  const aliases = new Set<string>();
  for (const model of catalog.models) {
    checkModel(model, names);
    if (aliases.has(model.alias))
      throw new Error(`目录模型「${model.alias}」重复。`);
    aliases.add(model.alias);
  }
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`模型目录的 ${label} 需要是键值表。`);
  return value as Record<string, unknown>;
}
function readEffortList(value: unknown, alias: string): Effort[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value))
    throw new Error(`目录模型「${alias}」的 support_efforts 需要是数组。`);
  return value as Effort[];
}
/** 解析 TOML 文本为内部目录；未知字段忽略，结构错误按条目报中文错误。 */
export function parseCatalog(text: string): ModelCatalog {
  let document: Record<string, unknown>;
  try {
    document = parse(text) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `模型目录 TOML 无法解析：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const catalog: ModelCatalog = { providers: [], models: [] };
  for (const [name, value] of Object.entries(
    readRecord(document.providers ?? {}, 'providers'),
  )) {
    const record = readRecord(value, `providers.${name}`);
    const headers =
      record.custom_headers === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(
              readRecord(
                record.custom_headers,
                `providers.${name}.custom_headers`,
              ),
            ).map(([key, header]) => {
              if (typeof header !== 'string')
                throw new Error(
                  `目录 provider「${name}」的 custom_headers「${key}」需要是文本。`,
                );
              return [key, header];
            }),
          );
    catalog.providers.push({
      name,
      type: String(record.type ?? '') as ProviderType,
      baseUrl: typeof record.base_url === 'string' ? record.base_url : '',
      apiKey: typeof record.api_key === 'string' ? record.api_key : '',
      ...(headers && Object.keys(headers).length ? { headers } : {}),
    });
  }
  for (const [alias, value] of Object.entries(
    readRecord(document.models ?? {}, 'models'),
  )) {
    const record = readRecord(value, `models."${alias}"`);
    const supportedEfforts = readEffortList(record.support_efforts, alias) ?? [
      ...defaultEfforts,
    ];
    const fallback = modelDefaults(
      typeof record.model === 'string' ? record.model : '',
    ).reasoningEffort;
    catalog.models.push({
      alias,
      provider: String(record.provider ?? ''),
      model: typeof record.model === 'string' ? record.model : '',
      displayName:
        typeof record.display_name === 'string' && record.display_name.trim()
          ? record.display_name.trim()
          : typeof record.model === 'string'
            ? record.model
            : '',
      contextWindow:
        typeof record.max_context_size === 'number'
          ? record.max_context_size
          : 0,
      supportedEfforts,
      defaultEffort:
        record.default_effort !== undefined
          ? (record.default_effort as Effort)
          : supportedEfforts.includes(fallback)
            ? fallback
            : supportedEfforts[supportedEfforts.length - 1],
    });
  }
  validateCatalog(catalog);
  return catalog;
}
/** 读取目录文件；文件不存在视为空目录。 */
export function loadCatalog(path: string): ModelCatalog {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { providers: [], models: [] };
    throw error;
  }
  return parseCatalog(text);
}

/** 把界面提交的目录规范化：type 校验后收窄、空 apiKey 沿用旧值。 */
export function catalogFromInput(
  input: CatalogInput,
  previous: ModelCatalog,
): ModelCatalog {
  const catalog: ModelCatalog = {
    providers: (input.providers ?? []).map((provider) => {
      const old = previous.providers.find((p) => p.name === provider.name);
      const apiKey = provider.apiKey?.trim() || old?.apiKey || '';
      // headers 未提交（undefined）沿用旧值；提交后过滤空白行，全空即清除
      const headers =
        provider.headers === undefined
          ? old?.headers
          : Object.fromEntries(
              Object.entries(provider.headers).filter(
                ([key, value]) => key.trim() && value.trim(),
              ),
            );
      return {
        name: provider.name?.trim() ?? '',
        type: provider.type as ProviderType,
        baseUrl: provider.baseUrl?.trim().replace(/\/$/, '') ?? '',
        apiKey,
        ...(headers && Object.keys(headers).length ? { headers } : {}),
      };
    }),
    models: (input.models ?? []).map((model) => {
      // 未提交该字段 → 默认档位；显式空数组 → 不设置思考级别
      const supportedEfforts =
        model.supportedEfforts === undefined
          ? [...defaultEfforts]
          : [...model.supportedEfforts];
      const fallback = modelDefaults(model.model?.trim() ?? '').reasoningEffort;
      return {
        alias: model.alias?.trim() ?? '',
        provider: model.provider?.trim() ?? '',
        model: model.model?.trim() ?? '',
        displayName: model.displayName?.trim() || model.model?.trim() || '',
        contextWindow: model.contextWindow,
        supportedEfforts,
        defaultEffort:
          model.defaultEffort ??
          (supportedEfforts.includes(fallback)
            ? fallback
            : supportedEfforts[supportedEfforts.length - 1]),
      };
    }),
  };
  validateCatalog(catalog);
  return catalog;
}

/** 序列化为 kimi-code schema 的 TOML 文本。 */
export function stringifyCatalog(catalog: ModelCatalog): string {
  const document: Record<string, unknown> = {
    providers: Object.fromEntries(
      catalog.providers.map((provider) => [
        provider.name,
        {
          type: provider.type,
          base_url: provider.baseUrl,
          api_key: provider.apiKey,
          ...(provider.headers ? { custom_headers: provider.headers } : {}),
        },
      ]),
    ),
    models: Object.fromEntries(
      catalog.models.map((model) => [
        model.alias,
        {
          provider: model.provider,
          model: model.model,
          display_name: model.displayName,
          max_context_size: model.contextWindow,
          support_efforts: model.supportedEfforts,
          ...(model.defaultEffort !== undefined
            ? { default_effort: model.defaultEffort }
            : {}),
        },
      ]),
    ),
  };
  return stringify(document);
}

/** 整份校验后原子重写目录（0600）；空 apiKey 沿用已保存值。 */
export async function saveCatalog(
  path: string,
  input: CatalogInput,
): Promise<ModelCatalog> {
  const catalog = catalogFromInput(input, loadCatalog(path));
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, stringifyCatalog(catalog), { mode: 0o600 });
    await rename(temp, path);
  } finally {
    await rm(temp, { force: true });
  }
  return catalog;
}

/** 公开条目（无密钥），供 API 返回。 */
export function publicCatalog(catalog: ModelCatalog): ModelCatalogEntry[] {
  return catalog.models.map((model) => {
    const provider = catalog.providers.find(
      (provider) => provider.name === model.provider,
    )!;
    return {
      alias: model.alias,
      provider: model.provider,
      model: model.model,
      displayName: model.displayName,
      protocol: publicProtocol(providerTypes[provider.type]),
      baseUrl: provider.baseUrl,
      contextWindow: model.contextWindow,
      supportedEfforts: model.supportedEfforts,
      defaultEffort: model.defaultEffort,
      apiKeyConfigured: !!provider.apiKey,
    };
  });
}

/** provider 公开信息（不含密钥与请求头内容）。 */
export function publicProviders(catalog: ModelCatalog): ModelCatalogProvider[] {
  return catalog.providers.map((provider) => ({
    name: provider.name,
    protocol: publicProtocol(providerTypes[provider.type]),
    baseUrl: provider.baseUrl,
    apiKeyConfigured: !!provider.apiKey,
    headersConfigured: !!provider.headers,
  }));
}

/** 按选择解析为完整 ModelConfig；别名缺失或强度非法时抛中文错误。 */
export function resolveModel(
  catalog: ModelCatalog,
  selection: ModelSelection,
): ModelConfig {
  const entry = catalog.models.find((model) => model.alias === selection.alias);
  if (!entry)
    throw new Error(`模型目录中没有「${selection.alias}」，请重新选择。`);
  const provider = catalog.providers.find(
    (provider) => provider.name === entry.provider,
  )!;
  const effort = selection.effort ?? entry.defaultEffort ?? 'off';
  // 不设置思考级别的模型只接受 off（或不传强度）
  const allowed = entry.supportedEfforts.length
    ? entry.supportedEfforts.includes(effort)
    : effort === 'off';
  if (!allowed)
    throw new Error(
      entry.supportedEfforts.length
        ? `目录模型「${entry.alias}」不支持思考级别「${effort}」，请重新选择。`
        : `目录模型「${entry.alias}」不设置思考级别，请重新选择。`,
    );
  return {
    ...modelDefaults(entry.model),
    protocol: providerTypes[provider.type],
    baseUrl: provider.baseUrl,
    model: entry.model,
    apiKey: provider.apiKey,
    reasoningEffort: effort,
    contextWindow: entry.contextWindow,
    ...(provider.headers ? { headers: provider.headers } : {}),
  };
}

/** 校验选择是否可用；可用返回 undefined，否则返回原因。 */
export function selectionProblem(
  catalog: ModelCatalog,
  selection: ModelSelection,
): string | undefined {
  try {
    resolveModel(catalog, selection);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
