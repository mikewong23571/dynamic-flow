import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { runPiSession } from '../src/server/assistant/pi.ts';

for (const [model, contextWindow, expected] of [
  ['deepseek-v4-flash', 1048576, 393216],
  ['another-model', 128000, 32768],
] as const) {
  test(`Anthropic request uses the output limit for ${model}`, async () => {
    let maxTokens: number | undefined;
    const server = createServer(async (req, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      maxTokens = JSON.parse(raw).max_tokens;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const events = [
        [
          'message_start',
          {
            type: 'message_start',
            message: {
              id: 'msg',
              type: 'message',
              role: 'assistant',
              model,
              content: [],
              stop_reason: null,
              usage: { input_tokens: 1, output_tokens: 1 },
            },
          },
        ],
        [
          'content_block_start',
          {
            type: 'content_block_start',
            index: 0,
            content_block: { type: 'text', text: '' },
          },
        ],
        [
          'content_block_delta',
          {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text: 'OK' },
          },
        ],
        ['content_block_stop', { type: 'content_block_stop', index: 0 }],
        [
          'message_delta',
          {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: 1 },
          },
        ],
        ['message_stop', { type: 'message_stop' }],
      ];
      for (const [name, value] of events)
        res.write(`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`);
      res.end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    try {
      const port = (server.address() as { port: number }).port;
      const result = await runPiSession({
        config: {
          protocol: 'anthropic-messages',
          baseUrl: `http://127.0.0.1:${port}`,
          model,
          apiKey: 'fixture',
          contextWindow,
          reasoningEffort: 'off',
        },
        systemPrompt: 'test',
        prompt: 'test',
        tools: [],
        signal: AbortSignal.timeout(10000),
      });
      assert.equal(result, 'OK');
      assert.equal(maxTokens, expected);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
}
