import { readFileSync } from 'node:fs';
import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ModelConfiguration,
  ModelSettings,
} from '../../shared/records.ts';
import { loadConfig, safeError, type ModelConfig } from './config.ts';

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
    : ['low', 'medium', 'high', 'max'];
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
function warnings(settings: ModelSettings): string[] {
  if (settings.protocol === 'anthropic-messages')
    return [
      'Anthropic 使用思考令牌预算映射强度：low 1024、medium 4096、high 8192、max 16384；这不是 Chat Completions 的 reasoning_effort。兼容网关是否严格执行预算由服务端决定。',
      'Anthropic 使用自身工具流和思考格式，不发送 Chat 专用的 tool_stream 或 clear_thinking。',
    ];
  if (settings.protocol === 'openai-responses')
    return [
      '推理强度通过 Responses 的 reasoning.effort 发送。采样参数会如实发送；部分模型不接受与推理同时设置的 Temperature/Top P，服务端拒绝时会显示实际错误。',
    ];
  return [
    '设置影响后续模型调用；保存只验证格式，不代表端点已连通或模型支持所有参数。',
  ];
}
export function createModelSettings(
  path: string | undefined,
  fallback: () => ModelConfig = loadConfig,
) {
  let writes = Promise.resolve();
  const read = (): { config: ModelConfig; source: 'env' | 'workspace' } => {
    if (path) {
      let saved: ModelSettings;
      try {
        saved = JSON.parse(readFileSync(path, 'utf8'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new Error('已保存的模型设置无法读取，请重新保存设置。');
        else return { config: fallback(), source: 'env' };
      }
      validateSettings(saved);
      if (!saved.apiKey?.trim())
        throw new Error('已保存设置缺少 API Key，请重新填写。');
      return {
        config: {
          ...saved,
          protocol:
            saved.protocol === 'openai-chat-completions'
              ? 'openai-completions'
              : saved.protocol,
          apiKey: saved.apiKey.trim(),
        },
        source: 'workspace',
      };
    }
    return { config: fallback(), source: 'env' };
  };
  const configuration = (): ModelConfiguration => {
    try {
      const { config, source } = read(),
        settings = resolvedSettings(config);
      validateSettings(settings);
      const { apiKey, ...safe } = settings;
      return {
        ...safe,
        ready: !!apiKey,
        apiKeyConfigured: !!apiKey,
        source,
        warnings: warnings(settings),
        supportedReasoningEfforts: supportedEfforts(settings),
      };
    } catch (error) {
      return {
        protocol: 'anthropic-messages',
        baseUrl: '',
        model: '',
        ...modelDefaults('glm-5.3-flash'),
        ready: false,
        apiKeyConfigured: false,
        source: 'env',
        error: safeError(error),
      };
    }
  };
  return {
    configuration,
    getConfig: () => {
      const { config } = read();
      validateSettings(resolvedSettings(config));
      return config;
    },
    saveConfiguration(settings: ModelSettings): Promise<ModelConfiguration> {
      const frozen = structuredClone(settings);
      const operation = writes.then(async () => {
        if (!path) throw new Error('服务器尚未配置模型设置文件路径。');
        validateSettings(frozen);
        let apiKey = frozen.apiKey?.trim();
        if (!apiKey) {
          try {
            apiKey = read().config.apiKey;
          } catch {}
        }
        if (!apiKey) throw new Error('请填写 API Key；当前没有可沿用的密钥。');
        const next: ModelSettings = {
          protocol: frozen.protocol,
          baseUrl: frozen.baseUrl.trim().replace(/\/$/, ''),
          model: frozen.model.trim(),
          reasoningEffort: frozen.reasoningEffort,
          temperature: frozen.temperature,
          topP: frozen.topP,
          contextWindow: frozen.contextWindow,
          apiKey,
        };
        await mkdir(dirname(path), { recursive: true });
        const temp = `${path}.${randomUUID()}.tmp`;
        try {
          await writeFile(temp, JSON.stringify(next, null, 2) + '\n', {
            mode: 0o600,
          });
          await rename(temp, path);
        } finally {
          await rm(temp, { force: true });
        }
        return configuration();
      });
      writes = operation.then(
        () => {},
        () => {},
      );
      return operation;
    },
  };
}
