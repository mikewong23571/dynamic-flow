import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { SharedWebSearch } from '../src/server/assistant/shared-websearch.ts';
import { mcpConfiguration } from '../src/server/assistant/mcp.ts';

async function fixture(
  options: { throttle?: boolean; missingSession?: boolean } = {},
) {
  const methods: string[] = [];
  let throttled = false;
  let missing = false;
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(req.method === 'DELETE' ? 204 : 405).end();
      return;
    }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const message = JSON.parse(raw);
    methods.push(message.method);
    assert.equal(req.headers.token, 'test-token');
    if (options.throttle && message.method === 'tools/call' && !throttled) {
      throttled = true;
      res.writeHead(429, { 'Retry-After': '1' }).end();
      return;
    }
    if (options.missingSession && message.method === 'tools/call' && !missing) {
      missing = true;
      res.writeHead(404).end();
      return;
    }
    if (message.method.startsWith('notifications/')) {
      res.writeHead(202).end();
      return;
    }
    const result =
      message.method === 'initialize'
        ? {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'fixture', version: '1' },
          }
        : message.method === 'tools/list'
          ? {
              tools: [
                {
                  name: 'search',
                  description: 'search',
                  inputSchema: {
                    type: 'object',
                    properties: { query: { type: 'string' } },
                  },
                },
              ],
            }
          : {
              content: [{ type: 'text', text: message.params.arguments.query }],
            };
    res
      .writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const config = mcpConfiguration(
    'node',
    { WEBSEARCH_MCP_URL: url, WEBSEARCH_MCP_TOKEN: 'test-token' },
    new URL('file:///tmp/no-mcp-env'),
  )!.mcpServers.websearch;
  const shared = new SharedWebSearch(config);
  return {
    shared,
    methods,
    async close() {
      await shared.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

test('concurrent sessions share one connection and calls retain their own results', async () => {
  const f = await fixture();
  try {
    await Promise.all([f.shared.tools(), f.shared.tools(), f.shared.tools()]);
    const results = await Promise.all(
      ['first', 'second'].map((query) => f.shared.call('search', { query })),
    );
    assert.deepEqual(
      results.map((result) => (result.content as { text: string }[])[0].text),
      ['first', 'second'],
    );
    assert.equal(f.methods.filter((m) => m === 'initialize').length, 1);
    assert.equal(f.methods.filter((m) => m === 'tools/list').length, 1);
    assert.equal(f.methods.filter((m) => m === 'tools/call').length, 2);
  } finally {
    await f.close();
  }
});

test('429 waits for Retry-After, while canceling a queued caller does not cancel another', async () => {
  const f = await fixture({ throttle: true });
  try {
    await f.shared.tools();
    const start = Date.now();
    const first = f.shared.call('search', { query: 'first' });
    const controller = new AbortController();
    const canceled = f.shared.call(
      'search',
      { query: 'canceled' },
      controller.signal,
    );
    controller.abort();
    await assert.rejects(canceled, { name: 'AbortError' });
    const result = await first;
    assert.equal((result.content as { text: string }[])[0].text, 'first');
    assert.ok(Date.now() - start >= 900);
    assert.equal(f.methods.filter((m) => m === 'tools/call').length, 2);
  } finally {
    await f.close();
  }
});

test('invalid session reconnects once and preserves the result', async () => {
  const f = await fixture({ missingSession: true });
  try {
    await f.shared.tools();
    const result = await f.shared.call('search', { query: 'retry' });
    assert.equal((result.content as { text: string }[])[0].text, 'retry');
    assert.equal(f.methods.filter((m) => m === 'initialize').length, 2);
    assert.equal(f.methods.filter((m) => m === 'tools/call').length, 2);
  } finally {
    await f.close();
  }
});

test('canceling a throttled active call leaves another caller able to finish', async () => {
  const f = await fixture({ throttle: true });
  try {
    await f.shared.tools();
    const controller = new AbortController();
    const first = f.shared.call(
      'search',
      { query: 'canceled' },
      controller.signal,
    );
    while (!f.methods.includes('tools/call'))
      await new Promise((resolve) => setTimeout(resolve, 5));
    const second = f.shared.call('search', { query: 'remaining' });
    controller.abort();
    await assert.rejects(first, { name: 'AbortError' });
    const result = await second;
    assert.equal((result.content as { text: string }[])[0].text, 'remaining');
  } finally {
    await f.close();
  }
});
