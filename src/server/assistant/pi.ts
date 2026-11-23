import { sharedWebSearch } from './shared-websearch.ts';
import { mkdir, mkdtemp, rm, symlink, lstat, readlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { InMemoryCredentialStore, type Model } from '@earendil-works/pi-ai';
import { streamSimple as anthropicStreamSimple } from '@earendil-works/pi-ai/api/anthropic-messages';
import {
  createAgentSession,
  createEventBus,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import type { Activity, Json } from '../../shared/records.ts';
import {
  mcpConfigEvent,
  mcpStatusEvent,
  type McpConfiguration,
} from './mcp.ts';
import { safeError, type ModelConfig } from './config.ts';
import { resolvedSettings, validateSettings, isGlm53 } from './settings.ts';

export interface SessionInput {
  config: ModelConfig;
  systemPrompt: string;
  prompt: string;
  tools: ToolDefinition[];
  /** 启用的内置工具名（read/grep/find/ls/bash 等）；默认不启用任何内置工具。 */
  builtinTools?: string[];
  /** 应用托管的 MCP 配置；插件向 Pi 注册工具，不进入模型提示词或快照。 */
  mcp?: McpConfiguration;
  /** 会话工作目录内的软链文件，供内置只读工具按相对名访问。 */
  linkFiles?: { path: string; as: string }[];
  /** 软链应用 node_modules 进会话目录，让 bash 会话内 node 脚本可解析预集成库。 */
  linkRuntime?: boolean;
  /** 会话成功结束后、临时目录清理前收割会话内产出的文件。 */
  collect?: (dir: string) => Promise<void>;
  /** 持久会话目录：提供时在其中创建/恢复 Pi 会话（JSONL 落盘、启用自动 compaction），
   * 目录保留；省略为一次性内存会话，临时目录用完即删。 */
  sessionDir?: string;
  signal: AbortSignal;
  onText?: (delta: string) => Promise<void>;
  onActivity?: (activity: Activity) => Promise<void>;
  onProgress?: (kind: string, characters: number) => void;
}
export type SessionRunner = (input: SessionInput) => Promise<string>;

export function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('调用已停止', 'AbortError');
}

/** Persistent sessions reuse only the exact same link; never replace user files. */
export async function linkSessionFile(source: string, destination: string) {
  try {
    await symlink(source, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const info = await lstat(destination);
    if (info.isSymbolicLink()) {
      const existing = await readlink(destination);
      if (resolve(dirname(destination), existing) === resolve(source)) return;
    }
    throw Error(
      `会话文件 ${basename(destination)} 已存在且指向其他内容，请更换上传文件名。`,
    );
  }
}

/** Pi owns the complete model/tool loop. This adapter only binds application events. */
export const runPiSession: SessionRunner = async (input) => {
  throwIfAborted(input.signal);
  // 持久会话：目录固定、跨请求保留（含进程重启）；一次性会话：临时目录用完即删。
  const persistent = !!input.sessionDir;
  const dir =
    input.sessionDir ?? (await mkdtemp(join(tmpdir(), 'dynamic-flow-pi-')));
  if (persistent) await mkdir(dir, { recursive: true });
  let session:
    Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;
  let events = Promise.resolve();
  let eventError: unknown;
  const activityIds = new Map<string, string>();
  const activityArgs = new Map<string, Json>();
  const eventBus = createEventBus();
  let removeMcpListener: (() => void) | undefined;
  let rejectMcpReady: ((error: Error) => void) | undefined;
  const queue = (callback: () => Promise<void>) => {
    events = events.then(callback).catch((error) => {
      eventError ??= error;
      void session?.abort();
    });
  };
  const abort = () => {
    rejectMcpReady?.(new DOMException('调用已停止', 'AbortError'));
    void session?.abort();
  };
  input.signal.addEventListener('abort', abort, { once: true });
  let mcp: McpConfiguration | undefined;
  try {
    const web = input.mcp?.mcpServers.websearch;
    const sharedTools = web
      ? await sharedWebSearch(web).tools(input.signal)
      : [];
    const remainingServers = Object.fromEntries(
      Object.entries(input.mcp?.mcpServers || {}).filter(
        ([name]) => name !== 'websearch',
      ),
    );
    mcp =
      input.mcp && Object.keys(remainingServers).length
        ? { ...input.mcp, mcpServers: remainingServers }
        : undefined;
    const customTools = [...input.tools, ...sharedTools];
    for (const link of input.linkFiles ?? []) {
      const as = basename(link.as);
      if (!as) throw new Error('链接文件名无效。');
      await linkSessionFile(link.path, join(dir, as));
    }
    if (input.linkRuntime) {
      const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));
      await linkSessionFile(
        join(projectRoot, 'node_modules'),
        join(dir, 'node_modules'),
      );
    }
    const settingsManager = SettingsManager.inMemory({
      // 持久会话启用 SDK 自动 compaction（上下文溢出时摘要旧轮次）；一次性会话不需要。
      compaction: { enabled: persistent },
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
    const budget = {
      off: 1024,
      minimal: 1024,
      low: 1024,
      medium: 4096,
      high: 8192,
      xhigh: 16384,
      max: 16384,
    }[settings.reasoningEffort];
    modelRuntime.registerProvider('dynamic-flow', {
      baseUrl: input.config.baseUrl,
      api: input.config.protocol,
      ...(input.config.headers ? { headers: input.config.headers } : {}),
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
          // DeepSeek 的旧 Flash 名称由官方 V4.1 Flash 服务承接，支持 384K 输出。
          maxTokens: /^(deepseek-v4-flash|deepseek-flash)$/i.test(
            settings.model,
          )
            ? 393216
            : 32768,
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
      eventBus,
      additionalExtensionPaths: mcp
        ? [fileURLToPath(new URL('./mcp-extension.js', import.meta.url))]
        : [],
      systemPrompt: input.systemPrompt,
    });
    await resourceLoader.reload();
    const extensionError = resourceLoader.getExtensions().errors[0];
    if (extensionError)
      throw Error(`Pi MCP 插件加载失败：${extensionError.error}`);
    if (mcp) eventBus.emit(mcpConfigEvent, mcp);
    throwIfAborted(input.signal);
    ({ session } = await createAgentSession({
      cwd: dir,
      agentDir: dir,
      modelRuntime,
      model,
      thinkingLevel: settings.reasoningEffort,
      resourceLoader,
      settingsManager,
      sessionManager: persistent
        ? SessionManager.continueRecent(dir, dir)
        : SessionManager.inMemory(),
      ...(mcp
        ? { noTools: 'builtin' as const }
        : {
            tools: [
              ...(input.builtinTools ?? []),
              ...customTools.map((tool) => tool.name),
            ],
          }),
      customTools,
    }));
    if (mcp) {
      const servers = Object.keys(mcp.mcpServers);
      const ready = new Promise<void>((resolve, reject) => {
        rejectMcpReady = reject;
        removeMcpListener = eventBus.on(mcpStatusEvent, (value) => {
          const status = value as {
            servers: { name: string; status: string }[];
          };
          const selected = status.servers.filter((server) =>
            servers.includes(server.name),
          );
          if (
            selected.some((server) =>
              ['failed', 'needs-auth'].includes(server.status),
            )
          )
            reject(Error('MCP 服务连接失败，请检查服务状态和凭据。'));
          else if (
            selected.length === servers.length &&
            selected.every((server) => server.status === 'connected')
          )
            resolve();
        });
      });
      await session.bindExtensions({ mode: 'print' });
      await ready;
      // 状态事件由初始化发出；让插件完成工具注册后再启用模型调用。
      await new Promise<void>((resolve) => setImmediate(resolve));
      throwIfAborted(input.signal);
      const mcpTools = session
        .getAllTools()
        .filter((tool) =>
          servers.some((server) => tool.name.startsWith(`${server}_`)),
        );
      if (!mcpTools.length) throw Error('MCP 服务没有注册可用工具。');
      session.setActiveToolsByName([
        ...(input.builtinTools ?? []),
        ...customTools.map((tool) => tool.name),
        ...mcpTools.map((tool) => tool.name),
      ]);
      removeMcpListener?.();
      rejectMcpReady = undefined;
    }
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
        activityArgs.set(event.toolCallId, event.args as Json);
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
              args: activityArgs.get(event.toolCallId),
              result: JSON.parse(JSON.stringify(event.result)) as Json,
            }),
          );
      }
    });
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
    removeMcpListener?.();
    if (mcp && session)
      await session.extensionRunner.emit({
        type: 'session_shutdown',
        reason: 'quit',
      });
    session?.dispose();
    await events;
    if (!persistent) await rm(dir, { recursive: true, force: true });
  }
};
