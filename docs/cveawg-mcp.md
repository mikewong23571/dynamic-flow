# CVEAWG MCP 接入

2026-10-22。Flowcraft 通过现有 Pi MCP 扩展启动本机 `cveawg-mcp` stdio 服务，向 Assistant 和普通 Agent 执行节点注册公开查询工具。动态规划、模型配置探针保持原范围。

## 本机配置与验证

`~/.codex/config.toml` 中原 cveawg 段落被注释；其中配置的命令实际已安装：`/home/mike/.local/bin/cveawg-mcp`。该命令指向 uv 管理的 Python 环境，启动时读取 CVEAWG OpenAPI 并注册工具。

默认继承本机 SOCKS 代理时，因 Python 环境未安装 `socksio` 而启动失败。直连启动、MCP 初始化、tools/list 和 `cve_exists(CVE-2025-27516)` 已通过，后者实际返回 exists=true / HTTP 200。应用仅清空 cveawg 子进程的大小写 HTTP_PROXY/HTTPS_PROXY/ALL_PROXY，不修改宿主环境或其他MCP服务的代理设置。

应用配置位于被Git忽略的 `.env.local`（0600）；也支持进程环境变量覆盖：

```dotenv
CVEAWG_MCP_COMMAND=/home/mike/.local/bin/cveawg-mcp
CVEAWG_BASE_URL=https://cveawg.mitre.org:8444/api
CVEAWG_OPENAPI_URL=https://cveawg.mitre.org:8444/api-docs/openapi.json
CVEAWG_TIMEOUT_SECONDS=20
```

没有配置 `CVEAWG_MCP_COMMAND` 时不启用该服务。没有改写Codex配置；应用独立读取上述设置。移动到其他机器时配置实际安装的命令路径。

## 提供给 Agent 的工具

| Pi 工具名 | 输入 | 用途 |
|---|---|---|
| `cveawg_cve_exists` | `cve_id` | 查询指定CVE记录是否存在 |
| `cveawg_cveGetSingle` | `id` | 读取CVE官方记录 |

实际服务共返回三个工具；第三个 `cveIdGetSingle` 需要 CVE-API-ORG/USER/KEY，本机没有配置这些账号凭据，因此应用只注册上述两个公开查询工具。

节点可直接要求“查询 CVE-2025-27516 的官方记录”。协议初始化、工具发现、进程启动/关闭由现有 pi-mcp-adapter 处理，节点不需要读取命令路径或编写MCP客户端。参数合同取自实际tools/list；成功/失败进入已有工具活动记录。

## 应用验证

- `pnpm exec tsx --test tests/mcp.test.ts tests/assistant.test.ts`：32项通过，包括CVEAWG配置范围、直连环境覆盖、公开工具选择，以及现有Pi插件/Assistant回归。
- `pnpm typecheck:app`：通过。
- [真实应用调用](evidence/cveawg-mcp/live-result.json)：通过应用HTTP接口，在私有临时数据目录分别发起Assistant查询存在状态与普通节点读取完整记录；使用现有真实模型，未写入用户流水线列表。实际结果及模型配置以该记录为准。
