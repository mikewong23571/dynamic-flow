# Sourcegraph MCP

Flowcraft 的 Assistant 和普通 Agent 执行节点通过现有 `pi-mcp-adapter` 使用 Sourcegraph。用户可在对话或节点任务中要求检索仓库、读取代码或检查提交；应用注册工具并保存调用活动，Agent 无需编写 MCP 客户端。动态流程规划和模型配置探针不加载这些工具。

## 本地连接

地址：`http://10.132.7.7/.api/mcp`。

服务端从进程环境变量读取；缺省读取被 Git 忽略的根 `.env.local`（0600）：

```dotenv
SOURCEGRAPH_MCP_URL=http://10.132.7.7/.api/mcp
SOURCEGRAPH_AUTH_HEADER="token <PAT>"
```

沿用 `env_http_headers` 映射语义：`Authorization = "SOURCEGRAPH_AUTH_HEADER"`。应用的 `mcp.ts` 在服务端读取此变量，转换为 Pi 插件支持的 `headers.Authorization`，仅存在于本次会话内存。Pi 插件不读取 Codex 的 `config.toml`，不为应用另建一份含 PAT 的 TOML。完整认证值必须为 `token <PAT>`；Bearer 配置会明确拒绝。

已配置的凭据不会进入浏览器配置、模型提示词、Definition 或运行输入。修改环境配置后，新会话读取新值；已开始的会话保持原配置。两项均未配置时不启用；只配一项时明确报错。

## 工具

工具以 `sourcegraph_` 为前缀，避免与 WebSearch 或本地工具重名：

- `keyword_search`、`code_finder`：检索代码。
- `list_repos`、`list_files`、`read_file`：定位仓库及文件、读取源码。
- `commit_search`、`diff_search`：检索提交及差异。
- `deepsearch_read`、`evaluator`：按服务实际工具合同调用。

参数以 MCP 返回的 inputSchema 为准。最小示例任务：

> 调用 sourcegraph_keyword_search，query 为 `context:global TODO count:1`，返回匹配仓库、文件路径和行号。

工具结果保留真实匹配与错误；没有匹配不等于代码不存在。此集成不自动改写现有 CVE 流水线，也不把仓库索引当成已核实的部署版本。

普通执行节点保留原有 WebSearch 并同时加载 Sourcegraph；Assistant 新增 Sourcegraph，保留原先不加载 WebSearch 的范围。应用仍等待已配置的 MCP 服务就绪后再开始模型调用。

## 验证

`pnpm exec tsx --test tests/mcp.test.ts tests/assistant.test.ts`：真实 Pi SDK 与插件，使用本地模型/MCP fixture 验证认证头、工具注册、调用成功/失败及凭据未进入模型请求；共 31 项通过。这与真实外部服务验证分开记录。

直接协议检查已通过 initialize、tools/list（9 个工具）和 keyword_search。应用 HTTP → Assistant/runtime → Pi 插件 → 实际服务的真实模型结果见 [应用调用证据](evidence/sourcegraph-mcp/live-result.json)。测试数据使用独立临时目录，不加入用户流水线列表；未改变默认模型或思考级别。
