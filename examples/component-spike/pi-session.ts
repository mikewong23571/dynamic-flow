import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  fauxProvider,
  fauxAssistantMessage,
  fauxToolCall,
  InMemoryCredentialStore,
  Type,
} from '@earendil-works/pi-ai';
import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { samples } from './src/fixtures.ts';
import type { WireEvent } from './src/bridge.ts';

export async function runPiFixture(input: {
  text: string;
  sampleIds: string[];
  signal: AbortSignal;
  emit: (event: WireEvent) => void;
  fast?: boolean;
}) {
  const dir = await mkdtemp(join(tmpdir(), 'dynamic-flow-spike-'));
  const faux = fauxProvider({
    tokensPerSecond: input.fast ? 100000 : 35,
    tokenSize: { min: 2, max: 4 },
  });
  const sampleId = input.sampleIds[0] ?? 's3';
  faux.setResponses([
    fauxAssistantMessage(
      fauxToolCall('inspect_sample', { sampleId }, { id: 'inspect-1' }),
      { stopReason: 'toolUse' },
    ),
    fauxAssistantMessage(
      `已读取样本 **${sampleId}**。\n\n这是 Pi faux provider 的固定响应。真实工具已查询样本；本轮发送时冻结的选择为：${input.sampleIds.join(', ') || '无'}。\n\n建议在 Method 中区分“新增能力”和“已有能力故障”，然后用相同样本比较候选。`,
    ),
  ]);
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: false },
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd: dir,
    agentDir: dir,
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: 'You are a deterministic component integration fixture.',
  });
  let session:
    Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;
  const abort = () => {
    void session?.abort();
  };
  try {
    const modelRuntime = await ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
      modelsStorePath: join(dir, 'models-cache.json'),
      refreshOnCreate: false,
    });
    modelRuntime.registerNativeProvider(faux.provider);
    await resourceLoader.reload();
    const tool = defineTool({
      name: 'inspect_sample',
      label: 'Inspect sample',
      description: 'Read a fixture sample by its stable ID.',
      parameters: Type.Object({ sampleId: Type.String() }),
      async execute(_id, params) {
        const sample = samples.find((item) => item.id === params.sampleId);
        if (!sample) throw new Error(`Unknown sample: ${params.sampleId}`);
        return {
          content: [{ type: 'text', text: JSON.stringify(sample) }],
          details: sample,
        };
      },
    });
    ({ session } = await createAgentSession({
      cwd: dir,
      agentDir: dir,
      modelRuntime,
      model: faux.getModel(),
      resourceLoader,
      settingsManager,
      sessionManager: SessionManager.inMemory(),
      tools: ['inspect_sample'],
      customTools: [tool],
    }));
    session.subscribe((event) => {
      if (
        event.type === 'message_update' &&
        event.assistantMessageEvent.type === 'text_delta'
      ) {
        input.emit({
          type: 'text.delta',
          text: event.assistantMessageEvent.delta,
        });
      } else if (event.type === 'tool_execution_start') {
        input.emit({
          type: 'tool.started',
          id: event.toolCallId,
          args: event.args,
        });
      } else if (event.type === 'tool_execution_end') {
        input.emit({
          type: 'tool.completed',
          id: event.toolCallId,
          result: event.result,
          isError: event.isError,
        });
      }
    });
    input.signal.addEventListener('abort', abort, { once: true });
    if (!input.signal.aborted) await session.prompt(input.text);
    input.emit({ type: input.signal.aborted ? 'cancelled' : 'done' });
    return { calls: faux.state.callCount, aborted: input.signal.aborted };
  } finally {
    input.signal.removeEventListener('abort', abort);
    session?.dispose();
    await rm(dir, { recursive: true, force: true });
  }
}
