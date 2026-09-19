/** Explicit real endpoint probes. No credentials or configuration contents are written. */
import { Type } from '@earendil-works/pi-ai';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { loadConfig, protocols, safeError } from './config.ts';
import { runPiSession } from './pi.ts';

const original = loadConfig();
const requested = process.argv[2] || original.protocol;
const list =
  requested === 'all'
    ? protocols
    : protocols.filter((protocol) => protocol === requested);
for (const protocol of list) {
  const config = {
    ...original,
    protocol,
    ...(process.env.PROBE_BASE_URL
      ? { baseUrl: process.env.PROBE_BASE_URL }
      : {}),
  };
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  let chunks = 0;
  let calls = 0;
  let activities = 0;
  const tool = defineTool({
    name: 'inspect_probe',
    label: 'Probe',
    description: 'Read the actual test value.',
    parameters: Type.Object({ key: Type.String() }),
    async execute() {
      calls++;
      return {
        content: [{ type: 'text', text: 'actual-probe-value-739' }],
        details: { value: 'actual-probe-value-739' },
      };
    },
  });
  try {
    const text = await runPiSession({
      config,
      systemPrompt:
        'You test a real tool. Call inspect_probe once, then reply with its returned value only.',
      prompt: 'Read the probe with key=test and reply with the value.',
      tools: [tool],
      signal: controller.signal,
      onText: async () => {
        chunks++;
      },
      onActivity: async () => {
        activities++;
      },
    });
    console.log(
      JSON.stringify({
        protocol,
        test: 'text-stream-tool-loop',
        ok: calls > 0 && chunks > 0 && text.includes('actual-probe-value-739'),
        calls,
        chunks,
        activities,
        elapsedMs: Date.now() - started,
      }),
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        protocol,
        test: 'text-stream-tool-loop',
        ok: false,
        error: safeError(error, config),
        elapsedMs: Date.now() - started,
      }),
    );
  } finally {
    clearTimeout(timeout);
  }
  const cancel = new AbortController();
  const cancelTimer = setTimeout(() => cancel.abort(), 1000);
  const cancelStarted = Date.now();
  try {
    await runPiSession({
      config,
      systemPrompt: 'Write a long detailed essay.',
      prompt: 'Explain fifty approaches to data analysis in detail.',
      tools: [],
      signal: cancel.signal,
    });
    console.log(
      JSON.stringify({
        protocol,
        test: 'cancel',
        ok: false,
        reason: 'completed before cancellation',
      }),
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        protocol,
        test: 'cancel',
        ok:
          cancel.signal.aborted &&
          error instanceof Error &&
          error.name === 'AbortError',
        elapsedMs: Date.now() - cancelStarted,
        error: safeError(error, config),
      }),
    );
  } finally {
    clearTimeout(cancelTimer);
  }
  const errorTimeout = new AbortController();
  const errorTimer = setTimeout(() => errorTimeout.abort(), 30000);
  try {
    await runPiSession({
      config: { ...config, model: 'dynamic-flow-deliberately-missing-model' },
      systemPrompt: 'Reply briefly.',
      prompt: 'Test error',
      tools: [],
      signal: errorTimeout.signal,
    });
    console.log(
      JSON.stringify({ protocol, test: 'provider-error', ok: false }),
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        protocol,
        test: 'provider-error',
        ok: !errorTimeout.signal.aborted,
        error: safeError(error, config),
      }),
    );
  } finally {
    clearTimeout(errorTimer);
  }
}
