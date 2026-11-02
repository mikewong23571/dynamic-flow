# WebSearch MCP 调用指南

记录日期：2026-10-22。本文记录已验证的服务接口与调用方法；Flowcraft 普通执行节点现通过 `pi-mcp-adapter@2.13.0` 接入；应用负责读取连接配置，Pi 扩展直接注册三个工具，节点不编写客户端。未写入 Claude 配置。

## 1. 地址与本地凭据

服务地址：`http://qianliu-gateway.sangfor.com/web-search/mcp/`。

仓库根目录 `.env.local` 已保存以下变量，真实 token 只放在该本地文件：

- token 存储位置：[`.env.local`](/home/mike/projs/fork/dynamic-flow/.env.local)，绝对路径为 `/home/mike/projs/fork/dynamic-flow/.env.local`。
- token 变量名：`WEBSEARCH_MCP_TOKEN`。
- 服务地址变量名：`WEBSEARCH_MCP_URL`。

```dotenv
WEBSEARCH_MCP_URL=http://qianliu-gateway.sangfor.com/web-search/mcp/
WEBSEARCH_MCP_TOKEN=<本地实际值>
```

`.env.local` 已被 `.gitignore` 中的 `.env.*` 规则忽略，文件权限为 `0600`。请勿把 token 复制进本文、Definition、节点任务、运行结果或可提交的客户端配置。

这是 MCP 的独立配置，不是模型凭据；Flowcraft 的模型目录仍由 `models.toml` 管理。应用的 `assistant/mcp.ts` 读取这些变量，`pi.ts` 经 Pi 扩展加载器加载 `mcp-extension.js`，由 pi-mcp-adapter 注册工具。配置不会进入节点任务或模型上下文。

## 2. 请求协议

本服务使用 HTTP 上的 MCP JSON-RPC，响应可能是 JSON，也可能是 SSE（`text/event-stream`）。

请求头：

| 名称                   | 值                                                          |
| ---------------------- | ----------------------------------------------------------- |
| `token`                | `.env.local` 的 `WEBSEARCH_MCP_TOKEN`，不要添加 Bearer 前缀 |
| `Content-Type`         | `application/json`                                          |
| `Accept`               | `application/json, text/event-stream`                       |
| `MCP-Protocol-Version` | 初始化完成后使用协商版本，本次验证为 `2024-11-05`           |
| `Mcp-Session-Id`       | 初始化响应返回该头时，后续请求原样带回                      |

一次会话的调用顺序：

1. `initialize`：提供协议版本、客户端信息和 capabilities。
2. `notifications/initialized`：通知初始化完成，无 JSON-RPC id；本次服务返回 HTTP 202。
3. `tools/list`：读取实际工具及 inputSchema。
4. `tools/call`：按工具名和参数调用，继续携带同一会话头。

`initialize` 请求体示例：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": {
      "name": "flowcraft-mcp-probe",
      "version": "1.0.0"
    }
  }
}
```

实测初始化返回服务 `web-search`，版本 `1.2.0`，工具能力包含 `listChanged:true`。

## 3. tools/list 返回的工具

### search

搜索网页。服务说明列出的引擎包括 Bing、DuckDuckGo、Exa、Brave、Baidu、Csdn、Linuxdo、Juejin、Startpage、Sogou、Hacker News；说明中列出不等于本次已经逐个验证可用。实际 engines 参数不受枚举 Schema 限制，应使用服务支持的标识。

| 参数      | 类型 / 约束      | 默认值     |
| --------- | ---------------- | ---------- |
| `query`   | 必填，非空字符串 | 无         |
| `limit`   | number，1–50     | 10         |
| `engines` | 非空字符串数组   | `["bing"]` |

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "search",
    "arguments": {
      "query": "CVE-2025-27516",
      "limit": 3,
      "engines": ["duckduckgo", "baidu"]
    }
  }
}
```

返回的文本内容通常是一个 JSON 字符串，包含 `query`、`engines`、`totalResults`、`results` 和 `partialFailures`。结果条目包含标题、URL、摘要、来源和引擎。

必须检查 `partialFailures`。HTTP 200、没有 MCP `isError` 不代表每个引擎都成功；零结果也不能直接推断“网上没有相关资料”。

### fetchWebContent

读取公开 HTTP(S) 网页正文。

| 参数           | 类型 / 约束                    | 默认值            |
| -------------- | ------------------------------ | ----------------- |
| `url`          | 必填，URI 字符串               | 无                |
| `maxChars`     | integer，1000–200000           | 30000             |
| `readability`  | 可选，boolean                  | Schema 未声明     |
| `includeLinks` | 可选，boolean                  | Schema 未声明     |
| `renderMode`   | `request` / `auto` / `browser` | 工具说明为 `auto` |

`request` 只使用 HTTP 获取；`auto` 可在 HTTP 获取后回退到浏览器；`browser` 直接使用 Playwright，服务端缺少 Playwright 时会明确失败。本次只验证了 `request`，尚未验证浏览器渲染路径。

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "fetchWebContent",
    "arguments": {
      "url": "https://www.python.org/",
      "maxChars": 30000,
      "renderMode": "request"
    }
  }
}
```

实测结果字段包含 `url`、`finalUrl`、`contentType`、`title`、`retrievalMethod`、`truncated`、`content`。检查正文是否完整、有实际内容；保存证据时保留来源 URL 和截断信息，必要时补取。

### fetchGithubReadme

获取 GitHub 仓库的 README，不提供任意源码树或补丁分析。

唯一参数为必填的非空字符串 `url`：

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "fetchGithubReadme",
    "arguments": {
      "url": "https://github.com/pallets/jinja"
    }
  }
}
```

本次直接返回 README 文本；不要假设每个工具的 text 内容一定是 JSON。

三个工具的 inputSchema 均为 draft-07，并且 `additionalProperties:false`。本次工具列表还标记 `execution.taskSupport:"forbidden"`，调用使用普通 `tools/call`，不要附加 MCP 后台 task 执行参数。

## 4. 可直接运行的最小客户端

从仓库根目录执行下列代码，使用 Python 标准库，无需安装 MCP SDK。代码从 `.env.local` 读取配置，内网请求明确直连，不使用当前 shell 的代理设置；不会输出 token 或完整会话 ID。

```bash
python3 - <<'PY'
import json
from pathlib import Path
import urllib.error
import urllib.request

# 本示例仅读取本指南约定的简单 KEY=value 配置，不执行 shell 文件。
config = {}
for line in Path('.env.local').read_text().splitlines():
    line = line.strip()
    if not line or line.startswith('#'):
        continue
    key, sep, value = line.partition('=')
    if sep:
        config[key.strip()] = value.strip().strip('\"\'')

endpoint = config['WEBSEARCH_MCP_URL']
secret = config['WEBSEARCH_MCP_TOKEN']
headers = {
    'token': secret,
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
}
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def rpc(method, params=None, request_id=None):
    message = {'jsonrpc': '2.0', 'method': method}
    if params is not None:
        message['params'] = params
    if request_id is not None:
        message['id'] = request_id
    request = urllib.request.Request(
        endpoint, data=json.dumps(message).encode(), headers=headers,
    )
    try:
        with opener.open(request, timeout=45) as response:
            session_id = response.headers.get('Mcp-Session-Id')
            if session_id:
                headers['Mcp-Session-Id'] = session_id
            raw = response.read().decode('utf-8')
            content_type = response.headers.get('Content-Type', '')
    except urllib.error.HTTPError as error:
        raise RuntimeError(f'MCP HTTP {error.code}') from None
    if not raw.strip():
        return None
    if 'text/event-stream' in content_type:
        messages = []
        for event in raw.replace('\r\n', '\n').split('\n\n'):
            data = '\n'.join(
                line[5:].lstrip()
                for line in event.splitlines() if line.startswith('data:')
            )
            if data:
                messages.append(json.loads(data))
        result = next(
            (item for item in reversed(messages)
             if request_id is not None and item.get('id') == request_id),
            None,
        )
    else:
        result = json.loads(raw)
    if request_id is not None and result is None:
        raise RuntimeError('MCP did not return the expected response')
    if result and 'error' in result:
        raise RuntimeError(json.dumps(result['error'], ensure_ascii=False))
    return result

initialized = rpc('initialize', {
    'protocolVersion': '2024-11-05',
    'capabilities': {},
    'clientInfo': {'name': 'flowcraft-mcp-probe', 'version': '1.0.0'},
}, 1)
negotiated = initialized['result']['protocolVersion']
headers['MCP-Protocol-Version'] = negotiated
rpc('notifications/initialized')
tools = rpc('tools/list', {}, 2)
print('Tools:', [tool['name'] for tool in tools['result']['tools']])

answer = rpc('tools/call', {
    'name': 'search',
    'arguments': {
        'query': 'CVE-2025-27516',
        'limit': 3,
        'engines': ['duckduckgo', 'baidu'],
    },
}, 3)
tool_result = answer['result']
if tool_result.get('isError'):
    raise RuntimeError('Search tool returned isError; inspect its result')
print(json.dumps(tool_result, ensure_ascii=False, indent=2).replace(secret, '[REDACTED]'))
PY
```

这是排障用的手工调用示例，不应交给节点 Agent 实现。应用执行使用 Pi MCP 插件，取消、HTTP/SSE 和认证由插件处理；工具调用通过现有 Pi 活动接线关联运行实例，取证正文随节点结果保存。调试时不要使用会打印认证请求头的 `curl -v` 或完整请求头日志。

## 5. 本会话此前实测记录

| 项目                      | 观察结果                                                       |
| ------------------------- | -------------------------------------------------------------- |
| 内网解析                  | 地址解析为 `10.72.10.81`，直连可用                             |
| initialize                | HTTP 200，SSE 返回，服务 `web-search 1.2.0`，有 session 响应头 |
| notifications/initialized | HTTP 202                                                       |
| tools/list                | HTTP 200，返回上述三个工具                                     |
| DuckDuckGo / 百度         | 查询 `CVE-2025-27516` 成功返回相关结果                         |
| Bing                      | 返回 `engine_error`：区域重定向次数超限                        |
| Brave                     | 返回 `ETIMEDOUT`，列在 partialFailures 中                      |
| Python 官网读取           | request 模式取得正文，短 maxChars 设置下返回 truncated 标记    |
| NVD 漏洞页读取            | request 模式只取得 `NVD - Home`，不能视为取得漏洞详情          |
| Jinja GitHub README       | 成功取得 README 文本                                           |
| 用户提供的历史 403        | 本会话使用同一提供的 token 初始化成功；历史拒绝原因未确认      |

这组记录说明入口和部分工具路径已经实际可用，不代表每个引擎、目标网站或渲染模式都已验收。

## 6. 与 CVE 研究流程的关系

建议使用 `cveawg` 读取 CVE 基础记录，再用本 MCP 搜索官方公告、修复 commit/PR 和版本依据，并读取正文留存证据。README 只提供仓库概览；源码核查仍按研究流程的仓库和版本要求执行。

cve-fix 既有日志确实记录了 `cveawg/cve_exists` 和 `cveawg/cveGetSingle` 调用，详见 [历史运行日志](/home/mike/projs/main/cve-fix/artifacts/cve_materials_promoted/CVE-2025-6547/run.log:116)。本会话探测 cveawg 时，默认代理环境缺少 SOCKS 依赖，临时取消代理后 MITRE 8444 端口连接被拒绝；这与本 WebSearch MCP 的可用性分开判断。

两条流水线的创建建议与其余能力缺口见 [CVE 流水线可行性分析](./cve-pipelines-feasibility.md)。

Sourcegraph 内部代码检索现沿用同一 Pi MCP 扩展，认证和工具范围见 [Sourcegraph MCP](sourcegraph-mcp.md)。
