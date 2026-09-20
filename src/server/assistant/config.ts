import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import type { ModelSettings } from '../../shared/records.ts';

export const protocols = [
  'anthropic-messages',
  'openai-completions',
  'openai-responses',
] as const;
export interface ModelConfig extends Partial<
  Pick<
    ModelSettings,
    'reasoningEffort' | 'temperature' | 'topP' | 'contextWindow'
  >
> {
  protocol: (typeof protocols)[number];
  baseUrl: string;
  model: string;
  apiKey: string;
  /** 目录 provider 的 custom_headers，原样透传给每次请求。 */
  headers?: Record<string, string>;
}

export function loadConfig(
  env?: Record<string, string | undefined>,
): ModelConfig {
  if (!env) {
    let local: Record<string, string | undefined> = {};
    try {
      local = parseEnv(readFileSync('.env.local', 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    env = { ...local, ...process.env };
  }
  const missing = [
    'LLM_PROTOCOL',
    'LLM_BASE_URL',
    'LLM_MODEL',
    'LLM_API_KEY',
  ].filter((key) => !env[key]?.trim());
  if (missing.length)
    throw new Error(
      `模型配置缺少 ${missing.join('、')}；请补充根目录 .env.local 后重试。`,
    );
  const configuredProtocol = env.LLM_PROTOCOL!.trim();
  const protocol =
    configuredProtocol === 'openai-chat-completions'
      ? 'openai-completions'
      : configuredProtocol;
  if (!protocols.includes(protocol as ModelConfig['protocol']))
    throw new Error(`不支持的模型协议：${protocol}`);
  let url: URL;
  try {
    url = new URL(env.LLM_BASE_URL!.trim());
  } catch {
    throw new Error('LLM_BASE_URL 不是有效的网址。');
  }
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('LLM_BASE_URL 需要 HTTP 或 HTTPS。');
  return {
    protocol: protocol as ModelConfig['protocol'],
    baseUrl: url.toString().replace(/\/$/, ''),
    model: env.LLM_MODEL!.trim(),
    apiKey: env.LLM_API_KEY!.trim(),
  };
}

export function safeError(error: unknown, config?: ModelConfig) {
  const message = error instanceof Error ? error.message : String(error);
  return config?.apiKey
    ? message.split(config.apiKey).join('[已隐藏凭据]')
    : message;
}
