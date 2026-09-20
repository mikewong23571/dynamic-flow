import { readFileSync } from 'node:fs';
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  EffectiveModel,
  ModelConfiguration,
  ModelScope,
  ModelSelection,
  ModelSettings,
  Work,
} from '../../shared/records.ts';
import { safeError, type ModelConfig } from './config.ts';
import {
  loadCatalog,
  publicCatalog,
  publicProviders,
  resolveModel,
  saveCatalog as writeCatalog,
  selectionProblem,
  type CatalogInput,
  type ModelCatalog,
} from './catalog.ts';

export function isGlm53(model: string) {
  return /^glm-5\.3(?:$|[-.])/i.test(model);
}
export function publicProtocol(
  protocol: ModelConfig['protocol'],
): ModelSettings['protocol'] {
  return protocol === 'openai-completions'
    ? 'openai-chat-completions'
    : protocol;
}
export function modelDefaults(
  model: string,
): Pick<
  ModelSettings,
  'reasoningEffort' | 'temperature' | 'topP' | 'contextWindow'
> {
  return {
    reasoningEffort: isGlm53(model) ? 'max' : 'medium',
    temperature: 1,
    topP: 0.95,
    contextWindow: isGlm53(model) ? 1000000 : 128000,
  };
}
export function resolvedSettings(config: ModelConfig): ModelSettings {
  return {
    ...modelDefaults(config.model),
    ...config,
    protocol: publicProtocol(config.protocol),
  };
}
export function supportedEfforts(
  settings: ModelSettings,
): ModelSettings['reasoningEffort'][] {
  return isGlm53(settings.model) && settings.protocol !== 'anthropic-messages'
    ? ['low', 'high', 'max']
    : ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
}
export function validateSettings(settings: ModelSettings): void {
  if (!settings || typeof settings !== 'object')
    throw new Error('请填写模型设置。');
  if (
    ![
      'anthropic-messages',
      'openai-chat-completions',
      'openai-responses',
    ].includes(settings.protocol)
  )
    throw new Error('请选择受支持的 API 协议。');
  if (typeof settings.model !== 'string' || !settings.model.trim())
    throw new Error('请填写模型名称。');
  let url: URL;
  try {
    url = new URL(settings.baseUrl);
  } catch {
    throw new Error('API 地址不是有效网址。');
  }
  if (!['https:', 'http:'].includes(url.protocol))
    throw new Error('API 地址需要 HTTP 或 HTTPS。');
  if (!supportedEfforts(settings).includes(settings.reasoningEffort))
    throw new Error(
      isGlm53(settings.model)
        ? 'GLM-5.3 的此协议仅支持 low、high、max 推理强度。'
        : '请选择有效的推理强度。',
    );
  if (
    !Number.isFinite(settings.temperature) ||
    settings.temperature < 0 ||
    settings.temperature > 2
  )
    throw new Error('Temperature 需要在 0 到 2 之间。');
  if (
    !Number.isFinite(settings.topP) ||
    settings.topP <= 0 ||
    settings.topP > 1
  )
    throw new Error('Top P 需要大于 0 且不超过 1。');
  if (
    !Number.isInteger(settings.contextWindow) ||
    settings.contextWindow < 8192 ||
    settings.contextWindow > 2000000
  )
    throw new Error('上下文窗口需要是 8192 到 2000000 之间的整数。');
  if (isGlm53(settings.model) && settings.temperature > 1)
    throw new Error('GLM-5.3 的 Temperature 不能超过 1。');
  if (
    settings.protocol === 'anthropic-messages' &&
    (settings.temperature !== 1 || settings.topP < 0.95)
  )
    throw new Error(
      'Anthropic 思考模式要求 Temperature 为 1、Top P 不小于 0.95；如需其它采样设置，请选择支持它们的协议。',
    );
  if (settings.apiKey !== undefined && typeof settings.apiKey !== 'string')
    throw new Error('API Key 需要是文本。');
}
function selectionShape(value: unknown): ModelSelection | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const selection = value as ModelSelection;
  if (typeof selection.alias !== 'string' || !selection.alias.trim())
    return undefined;
  const efforts = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
  if (
    selection.effort !== undefined &&
    !efforts.includes(selection.effort as string)
  )
    return undefined;
  return { alias: selection.alias.trim(), effort: selection.effort };
}
export function createModelSettings(
  path: string | undefined,
  catalogPath?: string,
) {
  let writes = Promise.resolve();
  const queue = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = writes.then(operation);
    writes = next.then(
      () => {},
      () => {},
    );
    return next;
  };
  const atomicWrite = async (target: string, contents: string) => {
    await mkdir(dirname(target), { recursive: true });
    const temp = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, contents, { mode: 0o600 });
      await rename(temp, target);
    } finally {
      await rm(temp, { force: true });
    }
  };
  const readCatalog = (): { catalog?: ModelCatalog; error?: string } => {
    if (!catalogPath) return { catalog: { providers: [], models: [] } };
    try {
      return { catalog: loadCatalog(catalogPath) };
    } catch (error) {
      return { error: safeError(error) };
    }
  };
  /** 读取全局默认选择；设置文件只存选择，损坏或缺失都视为未选择。 */
  const readSelection = (): ModelSelection | undefined => {
    if (!path) return undefined;
    try {
      return selectionShape(
        (
          JSON.parse(readFileSync(path, 'utf8')) as {
            defaultSelection?: unknown;
          }
        ).defaultSelection,
      );
    } catch {
      return undefined;
    }
  };
  /** 解析全局默认；不可用返回中文原因（未选择 / 目录不可读 / 选择失效）。 */
  const resolveDefault = ():
    | { config: ModelConfig; effective: EffectiveModel; problem?: undefined }
    | { problem: string } => {
    const listed = readCatalog();
    if (!listed.catalog)
      return { problem: `模型目录无法读取：${listed.error}` };
    const selection = readSelection();
    if (!selection)
      return {
        problem: '尚未选择默认模型，请在模型设置中添加目录模型并保存默认。',
      };
    const problem = selectionProblem(listed.catalog, selection);
    if (problem)
      return { problem: `默认模型「${selection.alias}」已失效：${problem}` };
    const config = resolveModel(listed.catalog, selection);
    return {
      config,
      effective: {
        source: 'default',
        alias: selection.alias,
        model: config.model,
        effort: config.reasoningEffort,
      },
    };
  };
  const configuration = (): ModelConfiguration => {
    const listed = readCatalog();
    const resolved = resolveDefault();
    return {
      ready: !resolved.problem,
      ...(resolved.problem ? { error: resolved.problem } : {}),
      ...(listed.error
        ? { warnings: [`模型目录无法读取：${listed.error}`] }
        : {}),
      catalog: listed.catalog ? publicCatalog(listed.catalog) : undefined,
      catalogProviders: listed.catalog
        ? publicProviders(listed.catalog)
        : undefined,
      defaultSelection: readSelection(),
      resolved: { default: resolved.problem ? 'none' : 'catalog' },
    };
  };
  /** 校验一个目录选择；不可用抛中文错误。 */
  const checkSelection = (selection: ModelSelection): void => {
    if (!catalogPath) throw new Error('服务器尚未配置模型目录文件路径。');
    const listed = readCatalog();
    if (!listed.catalog) throw new Error(`模型目录无法读取：${listed.error}`);
    const problem = selectionProblem(listed.catalog, selection);
    if (problem) throw new Error(problem);
  };
  return {
    configuration,
    checkSelection,
    /** 当前保存的全局默认选择。 */
    getDefaultSelection: readSelection,
    /** 按别名解析目录条目为完整配置（供测试连接）。 */
    catalogConfig: (alias: string): ModelConfig => {
      if (!catalogPath) throw new Error('服务器尚未配置模型目录文件路径。');
      const listed = readCatalog();
      if (!listed.catalog) throw new Error(`模型目录无法读取：${listed.error}`);
      const problem = selectionProblem(listed.catalog, { alias });
      if (problem) throw new Error(problem);
      return resolveModel(listed.catalog, { alias });
    },
    /**
     * 解析链：assistant 的 Work 覆盖 → 全局默认 → 未配置报错。
     * 覆盖别名失效时如实回退默认并在 requested 可见，不静默假装仍是所选模型。
     */
    getScopedConfig(
      scope: ModelScope,
      work?: Work,
    ): {
      config: ModelConfig;
      effective: EffectiveModel;
      requested?: ModelSelection;
    } {
      let requested: ModelSelection | undefined;
      if (scope === 'assistant') {
        const selection = work?.modelSelections?.assistant;
        if (selection) {
          const listed = readCatalog();
          if (!listed.catalog) requested = selection;
          else
            try {
              const config = resolveModel(listed.catalog, selection);
              return {
                config,
                effective: {
                  source: 'work',
                  alias: selection.alias,
                  model: config.model,
                  effort: config.reasoningEffort,
                },
              };
            } catch {
              requested = selection;
            }
        }
      }
      const resolved = resolveDefault();
      if (resolved.problem !== undefined)
        throw new Error(
          requested
            ? `对话选择的模型「${requested.alias}」已失效；${resolved.problem}`
            : resolved.problem,
        );
      return {
        config: resolved.config,
        effective: resolved.effective,
        requested,
      };
    },
    /** 保存全局默认选择；null 清除（回到未配置）。 */
    saveDefaultSelection(
      selection: ModelSelection | null,
    ): Promise<ModelConfiguration> {
      const frozen = selection ? structuredClone(selection) : null;
      return queue(async () => {
        if (!path) throw new Error('服务器尚未配置模型设置文件路径。');
        if (frozen) checkSelection(frozen);
        let saved: Record<string, unknown> = {};
        try {
          saved = JSON.parse(readFileSync(path, 'utf8'));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
            throw new Error('已保存的模型设置无法读取，请重新保存设置。');
        }
        if (frozen) saved.defaultSelection = frozen;
        else delete saved.defaultSelection;
        await atomicWrite(path, JSON.stringify(saved, null, 2) + '\n');
        return configuration();
      });
    },
    /** 整份重写模型目录；空 apiKey 沿用已保存值。引用检查由调用方先做。 */
    saveCatalog(input: CatalogInput): Promise<ModelConfiguration> {
      const frozen = structuredClone(input);
      return queue(async () => {
        if (!catalogPath) throw new Error('服务器尚未配置模型目录文件路径。');
        await writeCatalog(catalogPath, frozen);
        return configuration();
      });
    },
  };
}
