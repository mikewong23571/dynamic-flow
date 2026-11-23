import { createHash } from 'node:crypto';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Type } from '@earendil-works/pi-ai';
import {
  defineTool,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import type { McpConfiguration } from './mcp.ts';

type WebConfig = McpConfiguration['mcpServers'][string];
type Entry = {
  client: Client;
  tools: Awaited<ReturnType<Client['listTools']>>['tools'];
  lastUsed: number;
};
const registry = new Map<string, SharedWebSearch>();
const aborted = () => new DOMException('调用已停止', 'AbortError');
function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise((resolve, reject) => {
    const cancel = () => reject(aborted());
    signal.addEventListener('abort', cancel, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', cancel));
  });
}
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(aborted());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener('abort', cancel);
      resolve();
    }
    function cancel() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      reject(aborted());
    }
    signal?.addEventListener('abort', cancel, { once: true });
  });
}
function retryDelay(header: string | null, attempt: number) {
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0)
      return Math.max(100, seconds * 1000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(100, date - Date.now());
  }
  return Math.min(30000, 1000 * 2 ** Math.min(attempt, 5));
}
/** One read-only WebSearch connection and one queue per endpoint + credential. */
export class SharedWebSearch {
  private entry?: Entry;
  private connecting?: Promise<Entry>;
  private connectAbort?: AbortController;
  private waiters = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private idle?: NodeJS.Timeout;
  private retryAt = 0;
  private activeCalls = 0;
  constructor(private readonly config: WebConfig) {}
  private touch() {
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => {
      if (this.activeCalls || this.connecting) this.touch();
      else void this.close();
    }, 10 * 60_000);
    this.idle.unref();
  }
  private safe(error: unknown) {
    let message = error instanceof Error ? error.message : String(error);
    for (const value of Object.values(this.config.headers || {}))
      if (value) message = message.replaceAll(value, '[redacted]');
    if (this.config.url)
      message = message.replaceAll(this.config.url, '[WebSearch]');
    return message;
  }
  private async fetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    let attempts = 0;
    for (;;) {
      const remaining = this.retryAt - Date.now();
      if (remaining > 0) await delay(remaining, init?.signal || undefined);
      const response = await fetch(input, init);
      if (response.status !== 429) return response;
      const wait = retryDelay(response.headers.get('retry-after'), attempts++);
      this.retryAt = Math.max(this.retryAt, Date.now() + wait);
      await response.body?.cancel();
      // The server rejected the request before execution; only this read-only service is retried.
    }
  }
  private async open(signal: AbortSignal): Promise<Entry> {
    const client = new Client({
      name: 'flowcraft-websearch',
      version: '1.0.0',
    });
    const transport = new StreamableHTTPClientTransport(
      new URL(this.config.url!),
      {
        requestInit: { headers: this.config.headers },
        fetch: (input, init) => this.fetch(input, init),
      },
    );
    try {
      await client.connect(transport, { signal, timeout: 15 * 60_000 });
      const tools: Entry['tools'] = [];
      let cursor: string | undefined;
      do {
        const page = await client.listTools(cursor ? { cursor } : {}, {
          signal,
          timeout: 15 * 60_000,
        });
        tools.push(...page.tools);
        cursor = page.nextCursor;
      } while (cursor);
      const entry = { client, tools, lastUsed: Date.now() };
      client.onclose = () => {
        if (this.entry?.client === client) this.entry = undefined;
      };
      this.entry = entry;
      this.touch();
      return entry;
    } catch (error) {
      await client.close().catch(() => {});
      if (signal.aborted) throw aborted();
      throw Error(`WebSearch 连接失败：${this.safe(error)}`);
    }
  }
  async connection(signal?: AbortSignal): Promise<Entry> {
    if (signal?.aborted) throw aborted();
    if (this.entry) {
      this.entry.lastUsed = Date.now();
      this.touch();
      return this.entry;
    }
    if (!this.connecting) {
      this.connectAbort = new AbortController();
      const pending = this.open(this.connectAbort.signal);
      this.connecting = pending;
      void pending
        .finally(() => {
          if (this.connecting === pending) {
            this.connecting = undefined;
            this.connectAbort = undefined;
          }
        })
        .catch(() => {});
    }
    const current = this.connecting;
    this.waiters++;
    try {
      return await waitFor(current, signal);
    } finally {
      this.waiters--;
      if (!this.waiters && this.connecting === current && signal?.aborted)
        this.connectAbort?.abort();
    }
  }
  async tools(signal?: AbortSignal): Promise<ToolDefinition[]> {
    const entry = await this.connection(signal);
    const allowed = this.config.directTools;
    const tools = entry.tools.filter(
      (t) =>
        allowed.includes(t.name) && this.config.includeTools.includes(t.name),
    );
    if (!tools.length) throw Error('WebSearch 服务没有可用工具。');
    return tools.map((t) =>
      defineTool({
        name: `websearch_${t.name}`,
        label: `WebSearch · ${t.name}`,
        description: t.description || t.name,
        parameters: Type.Unsafe<Record<string, unknown>>(t.inputSchema),
        execute: async (_id, params, toolSignal) => {
          const owned =
            toolSignal && signal
              ? AbortSignal.any([toolSignal, signal])
              : toolSignal || signal;
          const result = CallToolResultSchema.parse(
            await this.call(t.name, params, owned),
          );
          if (result.isError) {
            const message =
              result.content
                ?.filter((c) => c.type === 'text')
                .map((c) => c.text)
                .join('\n') || 'WebSearch 工具执行失败。';
            throw Error(this.safe(message));
          }
          const content: (
            | { type: 'text'; text: string }
            | { type: 'image'; data: string; mimeType: string }
          )[] = [];
          for (const c of result.content) {
            if (c.type === 'text') content.push({ type: 'text', text: c.text });
            else if (c.type === 'image')
              content.push({
                type: 'image',
                data: c.data,
                mimeType: c.mimeType,
              });
          }
          return {
            content: content.length
              ? content
              : [{ type: 'text' as const, text: '（空结果）' }],
            details: { server: 'websearch', tool: t.name },
          };
        },
      }),
    );
  }
  async call(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ) {
    const job = this.tail
      .catch(() => {})
      .then(async () => {
        if (signal?.aborted) throw aborted();
        this.activeCalls++;
        try {
          let entry = await this.connection(signal);
          for (let attempt = 0; ; attempt++) {
            try {
              this.touch();
              return await entry.client.callTool(
                { name, arguments: args },
                CallToolResultSchema,
                { signal, timeout: 15 * 60_000 },
              );
            } catch (error) {
              if (signal?.aborted) throw aborted();
              const code = (error as { code?: number }).code;
              if (attempt === 0 && code === 404) {
                await this.invalidate(entry);
                entry = await this.connection(signal);
                continue;
              }
              throw Error(`WebSearch 调用失败：${this.safe(error)}`);
            }
          }
        } finally {
          this.activeCalls--;
          this.touch();
        }
      });
    this.tail = job.catch(() => {});
    return waitFor(job, signal);
  }
  private async invalidate(entry: Entry) {
    if (this.entry === entry) this.entry = undefined;
    await entry.client.close().catch(() => {});
  }
  async close() {
    if (this.idle) clearTimeout(this.idle);
    this.idle = undefined;
    this.connectAbort?.abort();
    const entry = this.entry;
    this.entry = undefined;
    if (entry) await entry.client.close().catch(() => {});
  }
}
export function sharedWebSearch(config: WebConfig) {
  const key = createHash('sha256')
    .update(JSON.stringify([config.url, config.headers]))
    .digest('hex');
  let current = registry.get(key);
  if (!current) {
    current = new SharedWebSearch(config);
    registry.set(key, current);
  }
  return current;
}
export async function closeSharedWebSearch() {
  const all = [...registry.values()];
  registry.clear();
  await Promise.all(all.map((c) => c.close()));
}
