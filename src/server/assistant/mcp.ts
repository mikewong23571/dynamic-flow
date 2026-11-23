import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
/** 交给 Pi MCP 插件的配置快照；支持 HTTP/stdio 服务和直接工具。 */
export interface McpConfiguration {
  mcpServers: Record<
    string,
    {
      url?: string;
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      headers?: Record<string, string>;
      auth: false;
      lifecycle: 'eager';
      directTools: string[];
      includeTools: string[];
      requestTimeoutMs: number;
    }
  >;
  settings: {
    toolPrefix: 'server';
    disableProxyTool: boolean;
    sampling: boolean;
    elicitation: boolean;
  };
}

export const mcpConfigEvent = 'flowcraft:mcp-configuration';
export const mcpStatusEvent = 'pi-mcp-adapter/status/v1';

/** 服务端读取连接配置；节点任务和模型上下文只包含工具合同。 */
export function mcpConfiguration(
  scope: 'node' | 'author',
  env: Record<string, string | undefined> = process.env,
  localPath = new URL('../../../.env.local', import.meta.url),
  selected?: readonly string[],
): McpConfiguration | undefined {
  let local: Record<string, string | undefined> = {};
  try {
    local = parseEnv(readFileSync(localPath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const value = (key: string) => env[key] ?? local[key];
  const servers: McpConfiguration['mcpServers'] = {};
  if (scope === 'node' && (!selected || selected.includes('websearch'))) {
    const url = value('WEBSEARCH_MCP_URL');
    const token = value('WEBSEARCH_MCP_TOKEN');
    if (url || token) {
      if (!url || !token) throw Error('WebSearch MCP 缺少服务地址或凭据。');
      servers.websearch = {
        url,
        headers: { token },
        auth: false,
        lifecycle: 'eager',
        directTools: ['search', 'fetchWebContent', 'fetchGithubReadme'],
        includeTools: ['search', 'fetchWebContent', 'fetchGithubReadme'],
        requestTimeoutMs: 60000,
      };
    }
  }
  if (!selected || selected.includes('sourcegraph')) {
    const sourcegraphUrl = value('SOURCEGRAPH_MCP_URL');
    // env_http_headers keeps the header's environment-variable name in configuration.
    // Resolve only on the server: pi-mcp-adapter consumes headers, not Codex config.toml.
    const env_http_headers = { Authorization: 'SOURCEGRAPH_AUTH_HEADER' };
    const authorization = value(env_http_headers.Authorization);
    if (sourcegraphUrl || authorization) {
      if (!sourcegraphUrl || !authorization)
        throw Error('Sourcegraph MCP 缺少服务地址或 SOURCEGRAPH_AUTH_HEADER。');
      if (!/^token \S+$/.test(authorization))
        throw Error(
          'SOURCEGRAPH_AUTH_HEADER 必须采用 token <PAT> 格式，不能使用 Bearer。',
        );
      const tools = [
        'code_finder',
        'commit_search',
        'deepsearch_read',
        'diff_search',
        'evaluator',
        'keyword_search',
        'list_files',
        'list_repos',
        'read_file',
      ];
      servers.sourcegraph = {
        url: sourcegraphUrl,
        headers: { Authorization: authorization },
        auth: false,
        lifecycle: 'eager',
        directTools: tools,
        includeTools: tools,
        requestTimeoutMs: 60000,
      };
    }
  }
  if (!selected || selected.includes('cveawg')) {
    const cveawgCommand = value('CVEAWG_MCP_COMMAND');
    if (cveawgCommand) {
      const tools = ['cve_exists', 'cveGetSingle'];
      servers.cveawg = {
        command: cveawgCommand,
        env: {
          CVEAWG_BASE_URL:
            value('CVEAWG_BASE_URL') || 'https://cveawg.mitre.org:8444/api',
          CVEAWG_OPENAPI_URL:
            value('CVEAWG_OPENAPI_URL') ||
            'https://cveawg.mitre.org:8444/api-docs/openapi.json',
          CVEAWG_TIMEOUT_SECONDS: value('CVEAWG_TIMEOUT_SECONDS') || '20',
          HTTP_PROXY: '',
          HTTPS_PROXY: '',
          ALL_PROXY: '',
          http_proxy: '',
          https_proxy: '',
          all_proxy: '',
        },
        auth: false,
        lifecycle: 'eager',
        directTools: tools,
        includeTools: tools,
        requestTimeoutMs: 60000,
      };
    }
  }
  for (const name of selected || []) {
    if (!servers[name]) throw Error(`MCP 服务 ${name} 未配置。`);
  }
  if (!Object.keys(servers).length) return undefined;
  return {
    mcpServers: servers,
    settings: {
      toolPrefix: 'server',
      disableProxyTool: true,
      sampling: false,
      elicitation: false,
    },
  };
}
