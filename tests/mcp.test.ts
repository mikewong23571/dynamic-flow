import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { runPiSession } from '../src/server/assistant/pi.ts';
import { mcpConfiguration } from '../src/server/assistant/mcp.ts';
import type { Activity } from '../src/shared/records.ts';

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
const noLocalFile = new URL('file:///tmp/flowcraft-mcp-test-missing-env');

test('MCP configuration is optional and keeps authentication in server configuration', () => {
  assert.equal(mcpConfiguration('node', {}, noLocalFile), undefined);
  assert.throws(
    () =>
      mcpConfiguration(
        'node',
        { WEBSEARCH_MCP_URL: 'http://localhost/mcp' },
        noLocalFile,
      ),
    /缺少/,
  );
  const config = mcpConfiguration(
    'node',
    {
      WEBSEARCH_MCP_URL: 'http://localhost/mcp',
      WEBSEARCH_MCP_TOKEN: 'fixture-token',
    },
    noLocalFile,
  )!;
  assert.equal(config.mcpServers.websearch.headers?.token, 'fixture-token');
  assert.deepEqual(config.mcpServers.websearch.directTools, [
    'search',
    'fetchWebContent',
    'fetchGithubReadme',
  ]);
});

for (const [serverName, toolName] of [
  ['websearch', 'search'],
  ['sourcegraph', 'keyword_search'],
] as const) {
  for (const fails of [false, true]) {
    test(
      `real Pi extension calls ${serverName} directly and records ${fails ? 'tool failure' : 'tool output'}`,
      { timeout: 30000 },
      async () => {
        const token = `fixture-token-${fails}`;
        const calls: Record<string, unknown>[] = [];
        const payloads: Record<string, any>[] = [];
        const activities: Activity[] = [];
        const mcpServer = createServer(async (req, res) => {
          if (req.method !== 'POST') {
            res.writeHead(req.method === 'DELETE' ? 204 : 405).end();
            return;
          }
          let raw = '';
          for await (const part of req) raw += part;
          const message = JSON.parse(raw);
          if (serverName === 'sourcegraph') {
            assert.equal(req.headers.authorization, `token ${token}`);
            assert.equal(req.headers.token, undefined);
          } else assert.equal(req.headers.token, token);
          if (message.method === 'notifications/initialized') {
            res.writeHead(202).end();
            return;
          }
          let result: unknown;
          if (message.method === 'initialize')
            result = {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'fixture-websearch', version: '1' },
            };
          else if (message.method === 'tools/list')
            result = {
              tools: [
                {
                  name: toolName,
                  description: 'Search fixture evidence',
                  inputSchema: {
                    type: 'object',
                    properties: { query: { type: 'string' } },
                    required: ['query'],
                    additionalProperties: false,
                  },
                },
              ],
            };
          else if (message.method === 'tools/call') {
            calls.push(message.params);
            result = {
              isError: fails,
              content: [
                {
                  type: 'text',
                  text: fails
                    ? 'fixture search failed'
                    : 'actual fixture evidence',
                },
              ],
            };
          } else {
            res.writeHead(400).end();
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
        });
        const modelServer = createServer(async (req, res) => {
          let raw = '';
          for await (const part of req) raw += part;
          const payload = JSON.parse(raw);
          payloads.push(payload);
          assert.equal(raw.includes(token), false);
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          const toolCall = payloads.length === 1;
          const delta = toolCall
            ? {
                role: 'assistant',
                tool_calls: [
                  {
                    index: 0,
                    id: 'call-fixture',
                    type: 'function',
                    function: {
                      name: `${serverName}_${toolName}`,
                      arguments: '{"query":"CVE-fixture"}',
                    },
                  },
                ],
              }
            : { role: 'assistant', content: 'finished' };
          for (const [value, finish] of [
            [delta, null],
            [{}, toolCall ? 'tool_calls' : 'stop'],
          ] as const) {
            res.write(
              `data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta: value, finish_reason: finish }] })}\n\n`,
            );
          }
          res.end('data: [DONE]\n\n');
        });
        const mcpUrl = await listen(mcpServer);
        const modelUrl = await listen(modelServer);
        try {
          const mcp = mcpConfiguration(
            'node',
            serverName === 'websearch'
              ? { WEBSEARCH_MCP_URL: mcpUrl, WEBSEARCH_MCP_TOKEN: token }
              : {
                  SOURCEGRAPH_MCP_URL: mcpUrl,
                  SOURCEGRAPH_AUTH_HEADER: `token ${token}`,
                },
            noLocalFile,
          )!;
          // 本 fixture 只有一个工具；真实服务的可用工具由实际 tools/list 决定。
          mcp.mcpServers[serverName].directTools = [toolName];
          mcp.mcpServers[serverName].includeTools = [toolName];
          const output = await runPiSession({
            config: {
              protocol: 'openai-completions',
              baseUrl: modelUrl,
              model: 'fixture',
              apiKey: 'model-fixture',
            },
            systemPrompt: 'Use the supplied search tool.',
            prompt: 'Search CVE-fixture.',
            tools: [],
            mcp,
            signal: AbortSignal.timeout(20000),
            onActivity: async (activity) => {
              activities.push(activity);
            },
          });
          assert.equal(output, 'finished');
          assert.deepEqual(
            payloads[0].tools.map((tool: any) => tool.function.name),
            [`${serverName}_${toolName}`],
          );
          assert.deepEqual(calls, [
            { name: toolName, arguments: { query: 'CVE-fixture' } },
          ]);
          assert.ok(
            payloads[1].messages.some(
              (message: any) =>
                message.role === 'tool' &&
                JSON.stringify(message).includes(
                  fails ? 'fixture search failed' : 'actual fixture evidence',
                ),
            ),
          );
          const finished = activities.find(
            (a) =>
              a.toolName === `${serverName}_${toolName}` &&
              a.status !== 'running',
          )!;
          assert.equal(finished.status, fails ? 'failed' : 'completed');
          assert.deepEqual(finished.args, { query: 'CVE-fixture' });
        } finally {
          await Promise.all([close(modelServer), close(mcpServer)]);
        }
      },
    );
  }
}

test('Sourcegraph environment header uses token authentication in node and author scopes', () => {
  const env = {
    SOURCEGRAPH_MCP_URL: 'http://sourcegraph.invalid/.api/mcp',
    SOURCEGRAPH_AUTH_HEADER: 'token fixture-sourcegraph',
    WEBSEARCH_MCP_URL: 'http://websearch.invalid/mcp',
    WEBSEARCH_MCP_TOKEN: 'fixture-websearch',
  };
  const node = mcpConfiguration('node', env, noLocalFile)!;
  assert.deepEqual(Object.keys(node.mcpServers), ['websearch', 'sourcegraph']);
  assert.equal(
    node.mcpServers.sourcegraph.headers?.Authorization,
    env.SOURCEGRAPH_AUTH_HEADER,
  );
  assert.equal(node.mcpServers.sourcegraph.directTools.length, 9);
  const author = mcpConfiguration('author', env, noLocalFile)!;
  assert.deepEqual(Object.keys(author.mcpServers), ['sourcegraph']);
  assert.throws(
    () =>
      mcpConfiguration(
        'author',
        { ...env, SOURCEGRAPH_AUTH_HEADER: 'Bearer secret' },
        noLocalFile,
      ),
    /不能使用 Bearer/,
  );
  assert.throws(
    () =>
      mcpConfiguration(
        'author',
        { SOURCEGRAPH_MCP_URL: env.SOURCEGRAPH_MCP_URL },
        noLocalFile,
      ),
    /缺少/,
  );
});

test('CVEAWG uses a scoped stdio process and exposes public queries in node and author sessions', () => {
  for (const scope of ['node', 'author'] as const) {
    assert.equal(mcpConfiguration(scope, {}, noLocalFile), undefined);
    const config = mcpConfiguration(
      scope,
      {
        CVEAWG_MCP_COMMAND: '/fixture/bin/cveawg-mcp',
        CVEAWG_BASE_URL: 'https://fixture.invalid/api',
        CVEAWG_OPENAPI_URL: 'https://fixture.invalid/openapi.json',
        HTTP_PROXY: 'socks5://fixture.invalid:1080',
      },
      noLocalFile,
    )!;
    const server = config.mcpServers.cveawg;
    assert.equal(server.command, '/fixture/bin/cveawg-mcp');
    assert.equal(server.url, undefined);
    assert.equal(server.env?.CVEAWG_BASE_URL, 'https://fixture.invalid/api');
    assert.equal(server.env?.HTTP_PROXY, '');
    assert.equal(server.env?.https_proxy, '');
    assert.deepEqual(server.directTools, ['cve_exists', 'cveGetSingle']);
    assert.deepEqual(server.includeTools, server.directTools);
  }
});

test('explicit MCP services are filtered before configuration and missing selected services fail', () => {
  const env = {
    WEBSEARCH_MCP_URL: 'http://invalid',
    SOURCEGRAPH_MCP_URL: 'http://source',
    SOURCEGRAPH_AUTH_HEADER: 'token fixture',
  };
  const config = mcpConfiguration('node', env, noLocalFile, ['sourcegraph']);
  assert.deepEqual(Object.keys(config!.mcpServers), ['sourcegraph']);
  assert.equal(mcpConfiguration('node', env, noLocalFile, []), undefined);
  assert.throws(
    () => mcpConfiguration('node', {}, noLocalFile, ['cveawg']),
    /cveawg.*配置/,
  );
});
