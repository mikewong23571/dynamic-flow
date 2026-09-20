import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { InMemoryCredentialStore, type Model } from '@earendil-works/pi-ai';
import { streamSimple as anthropicStreamSimple } from '@earendil-works/pi-ai/api/anthropic-messages';
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import type { Activity, Json } from '../../shared/records.ts';
import { safeError, type ModelConfig } from './config.ts';
import { resolvedSettings, validateSettings, isGlm53 } from './settings.ts';

export interface SessionInput {
  config: ModelConfig;
  systemPrompt: string;
  prompt: string;
  tools: ToolDefinition[];
  /** 启用的内置工具名（read/grep/find/ls/bash 等）；默认不启用任何内置工具。 */
  builtinTools?: string[];
  /** 会话工作目录内的软链文件，供内置只读工具按相对名访问。 */
  linkFiles?: { path: string; as: string }[];
  /** 软链应用 node_modules 进会话目录，让 bash 会话内 node 脚本可解析预集成库。 */
  linkRuntime?: boolean;
  /** 会话成功结束后、临时目录清理前收割会话内产出的文件。 */
  collect?: (dir: string) => Promise<void>;
  signal: AbortSignal;
  onText?: (delta: string) => Promise<void>;
  onActivity?: (activity: Activity) => Promise<void>;
  onProgress?: (kind: string, characters: number) => void;
}
export type SessionRunner = (input: SessionInput) => Promise<string>;

export function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('调用已停止', 'AbortError');
}

/** Pi owns the complete model/tool loop. This adapter only binds application events. */
export const runPiSession: SessionRunner = async (input) => {
  throwIfAborted(input.signal);
  const dir = await mkdtemp(join(tmpdir(), 'dynamic-flow-pi-'));
  let session:
    Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;
  let events = Promise.resolve();
  let eventError: unknown;
  const activityIds = new Map<string, string>();
  const queue = (callback: () => Promise<void>) => {
    events = events.then(callback).catch((error) => {
      eventError ??= error;
      void session?.abort();
    });
  };
  const abort = () => {
    void session?.abort();
  };
  try {
    for (const link of input.linkFiles ?? []) {
      const as = basename(link.as);
      if (!as) throw new Error('链接文件名无效。');
      await symlink(link.path, join(dir, as));
    }
    if (input.linkRuntime) {
      const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));
      await symlink(join(projectRoot, 'node_modules'), join(dir, 'node_modules'));
    }
    const settingsManager = SettingsManager.inMemory({
      compaction: { enabled: false },
      // 网关会在长时间思考/长会话中断流（terminated）；模型调用级重试让循环续跑，
      // 已完成的工具调用不会重放。
      retry: { enabled: true, maxRetries: 3, baseDelayMs: 2000 },
    });
    const modelRuntime = await ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
      modelsStorePath: join(dir, 'models.json'),
      refreshOnCreate: false,
    });
    const settings = resolvedSettings(input.config);
    validateSettings(settings);
    const isChat = input.config.protocol === 'openai-completions';
    const isZai =
      /^glm-/i.test(settings.model) ||
      /(?:bigmodel\.cn|z\.ai)/i.test(settings.baseUrl);
    const budget = { low: 1024, medium: 4096, high: 8192, max: 16384 }[
      settings.reasoningEffort
    ];
    modelRuntime.registerProvider('dynamic-flow', {
      baseUrl: input.config.baseUrl,
      api: input.config.protocol,
      ...(input.config.protocol === 'anthropic-messages'
        ? {
            streamSimple: (model, context, options) =>
              anthropicStreamSimple(
                model as Model<'anthropic-messages'>,
                context,
                {
                  ...options,
                  thinkingBudgets: {
                    minimal: 1024,
                    low: 1024,
                    medium: 4096,
                    high: budget,
                  },
                  onPayload: async (payload, selectedModel) => {
                    const next = {
                      ...(payload as Record<string, unknown>),
                      temperature: settings.temperature,
                      top_p: settings.topP,
                    };
                    return (
                      (await options?.onPayload?.(next, selectedModel)) ?? next
                    );
                  },
                },
              ),
          }
        : {}),
      models: [
        {
          id: settings.model,
          name: settings.model,
          reasoning: true,
          thinkingLevelMap: {
            off: null,
            minimal: 'low',
            low: 'low',
            medium: isGlm53(settings.model) && isChat ? null : 'medium',
            high: 'high',
            xhigh: 'max',
            max: 'max',
          },
          input: ['text'],
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: settings.contextWindow,
          maxTokens: 32768,
          samplingParams: {
            temperature: settings.temperature,
            top_p: settings.topP,
          },
          ...(isChat
            ? {
                compat: {
                  supportsStore: false,
                  supportsDeveloperRole: false,
                  maxTokensField: 'max_tokens' as const,
                  supportsReasoningEffort: true,
                  ...(isZai
                    ? { thinkingFormat: 'zai' as const, zaiToolStream: true }
                    : {}),
                },
              }
            : {}),
        },
      ],
    });
    await modelRuntime.setRuntimeApiKey('dynamic-flow', input.config.apiKey);
    const model = modelRuntime.getModel('dynamic-flow', input.config.model);
    if (!model) throw new Error('Pi 未能注册所配置的模型。');
    const resourceLoader = new DefaultResourceLoader({
      cwd: dir,
      agentDir: dir,
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: input.systemPrompt,
    });
    await resourceLoader.reload();
    throwIfAborted(input.signal);
    ({ session } = await createAgentSession({
      cwd: dir,
      agentDir: dir,
      modelRuntime,
      model,
      thinkingLevel: settings.reasoningEffort,
      resourceLoader,
      settingsManager,
      sessionManager: SessionManager.inMemory(),
      tools: [
        ...(input.builtinTools ?? []),
        ...input.tools.map((tool) => tool.name),
      ],
      customTools: input.tools,
    }));
    session.subscribe((event) => {
      if (event.type === 'message_update') {
        const delta = event.assistantMessageEvent;
        if ('delta' in delta && typeof delta.delta === 'string')
          input.onProgress?.(delta.type, delta.delta.length);
      }
      if (
        event.type === 'message_update' &&
        event.assistantMessageEvent.type === 'text_delta'
      ) {
        const delta = event.assistantMessageEvent.delta;
        if (input.onText) queue(() => input.onText!(delta));
      } else if (event.type === 'tool_execution_start') {
        const id = randomUUID();
        activityIds.set(event.toolCallId, id);
        if (input.onActivity)
          queue(() =>
            input.onActivity!({
              id,
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              status: 'running',
              args: event.args as Json,
            }),
          );
      } else if (event.type === 'tool_execution_end') {
        const id = activityIds.get(event.toolCallId) ?? randomUUID();
        if (input.onActivity)
          queue(() =>
            input.onActivity!({
              id,
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              status: event.isError ? 'failed' : 'completed',
              result: JSON.parse(JSON.stringify(event.result)) as Json,
            }),
          );
      }
    });
    input.signal.addEventListener('abort', abort, { once: true });
    throwIfAborted(input.signal);
    await session.prompt(input.prompt);
    await events;
    if (eventError) throw eventError;
    throwIfAborted(input.signal);
    const last = [...session.messages]
      .reverse()
      .find((message) => message.role === 'assistant');
    if (
      last?.role === 'assistant' &&
      (last.stopReason === 'error' || last.stopReason === 'aborted')
    )
      throw new Error(
        last.errorMessage ||
          `模型调用${last.stopReason === 'aborted' ? '已停止' : '失败'}`,
      );
    if (last?.role === 'assistant' && last.stopReason === 'length')
      throw new Error('模型输出达到长度上限，请缩小输入或任务后重试。');
    if (input.collect) await input.collect(dir);
    return session.getLastAssistantText() ?? '';
  } catch (error) {
    if (input.signal.aborted)
      throw new DOMException('调用已停止', 'AbortError');
    throw new Error(safeError(error, input.config));
  } finally {
    input.signal.removeEventListener('abort', abort);
    session?.dispose();
    await events;
    await rm(dir, { recursive: true, force: true });
  }
};
