# CVE 流水线

当前入口为 [v2：漏洞事实研究与仓库漏洞核查](v2/README.md)。两条新方法已安装；v1两条旧Work及其运行已按本轮授权备份并移出应用，不再是当前采用版本。v1定义、截图和真实测试记录继续保留作历史证据，不代表v2已重验相同结论。当前进展与首版反馈见 [v2实施track](../../conductor/tracks/feature-cve-agent-v2_20261022/index.md)。

## v1历史记录

2026-10-22。当时两条原生 Definition 保存到本地 Flowcraft 并采用。真实测试纠正了 MCP 接入方式：应用通过 Pi 扩展加载器安装 pi-mcp-adapter，向普通执行节点注册原生 WebSearch 工具，原来的节点自写客户端版本及运行保留为历史。两条真实运行及产物交接已完成；业务影响仍为 incomplete / undetermined，证据与使用记录见 [真实测试](evidence/2026-10-22-live/README.md)。

| 流水线       | 本地 Work ID                           | 采用的 Definition ID                   | 步骤 |
| ------------ | -------------------------------------- | -------------------------------------- | ---- |
| 漏洞材料收集 | `a6b0f746-1095-46b4-8f20-008d80d8c654` | `bbfd0ac7-307e-490f-8b88-7268f92fe83a` | 6    |
| 业务影响分析 | `5cb210fc-f700-43bd-9946-736d869db90b` | `9a1d8ece-d08e-4883-a4ae-856adcbfc39a` | 10   |

上述ID仅供追查历史证据；这些旧方法现已移出应用，当前应打开v2方法。

## 第一条：漏洞材料收集

[定义与布局](materials-v1.json)：明确研究问题 → 收集公告与上游证据 → 梳理版本与触发条件 → 形成材料调查结果 → 记录本轮进展 → 输出材料说明。

- 输入：一个漏洞编号（允许 CVE、WS 等）、组件线索、待确认问题和已有材料。工作项只有编号时，也应把编号与问题写为至少一条任务材料。
- WebSearch：应用安装 `pi-mcp-adapter@2.13.0`，在 Pi 会话中直接注册 `websearch_search`、`websearch_fetchWebContent`、`websearch_fetchGithubReadme`。节点只传查询或 URL；连接协议、会话、认证和结果适配由插件处理。凭据只在服务端读取。[服务合同](../../docs/websearch-mcp.md)。
- 输出：`materials` 是包含状态、版本范围、触发条件、来源和正文的结构化结果；`report` 是 Markdown 说明。`source_documents` 保存本轮实际取得的相关原文或摘录、URL、获取信息及截断标记，随现有节点结果落盘。
- `completed/incomplete/failed` 描述材料结果；运行完成不表示材料齐全。里程碑只写“已形成材料调查记录”。

本版不创建外部包，`package_ref` 为 null。新网页来源以内联正文和工具活动供复核；现有材料编号校验继续只检查本次输入材料，不宣称程序已经验证网页内容的真实性。

## 第二条：业务影响分析

2026-10-22 已重新设计背景与三个 Agent 提示词，见 [v1提示词记录](business-impact-prompts.md)。方法结构和输出合同保持；正在执行的旧 Run 仍使用其固定版本。旧测试记录不作为新版模型验证。

[定义与布局](business-impact-v1.json)：固定材料与业务范围 → 检查候选 → 分流 → 展开并逐系统核查／保留待发现范围 → 具名收集 → 计算整体结论 → 记录本轮进展 → 输出报告。

- 输入：明确选定的漏洞材料及其来源、约定业务范围、依赖／源码／配置／部署线索。候选系统并发为 1。
- 业务核查沿给定仓库线索使用 Sourcegraph 定位 revision 和源码，分别报告源码依据与部署证据。
- Agent 判断单个系统的事实；纯表达式汇总 `impacted/partially_impacted/not_impacted/undetermined`，输出受影响、已排除、待定及未覆盖范围。
- 空候选分支由逐项函数生成明确缺口；不会因为空数组消失而变成“不受影响”。有影响且另有待定／排除／未覆盖范围时为 `partially_impacted`；无确认影响且有未决范围时为 `undetermined`；范围齐全且全部有排除结论时才为 `not_impacted`。
- 输出 `impact` 结构化结果和 `report` Markdown 报告；进展不自动确认完成条件或结项。

## 人工交接

同一 WorkItem 先运行 A，结束后选取 `materials` 的完整正文，通过“补充证据”添加到该工作项。正文前附实际源 `workId/runId/definitionId/resultId`（从运行记录读取），以该固定结果标识本轮材料版本；不要只复制报告摘要或编造包路径。

再补充业务范围与系统线索，将工作项方法切为 B，发起新 Run。B 的 `materials_ref` 记录上述来源。历史 A 与 B 的运行保持各自版本与输入。当前是人工选定节点结果的交接，尚未实现外部包发布或自动接续。

## 重建与验证

从仓库根目录、正式服务已启动时执行：

```sh
pnpm exec tsx pipelines/cve/install.ts
# 其他服务地址可作为第一个参数：
pnpm exec tsx pipelines/cve/install.ts http://127.0.0.1:4321
```

安装脚本先用实际 `checkDefinition` 校验两份定义，再调用现有 HTTP 动作创建、命名、保存布局和采用。节点任务不包含 MCP 接入点、凭据或客户端代码；凭据由服务端从 `.env.local` 读取。重复安装遇到相同定义直接复用；已有不同做法时保留现场并报错。跨机器使用时，脚本应在 Flowcraft 服务所在仓库执行。

本次实际验证：

- API 保存、采用、读回：两条定义均零校验问题；重复安装复用相同 Work 与 Definition。
- 临时数据真实运行器、Agent 执行替身：空候选、一项受影响一项待定、部分范围未覆盖、全部排除、影响与排除混合，以及 A 材料不足，共 6 条主线均通过。未决结果没有误写为完整或无影响。
- 本地 Playwright 实际搜索、打开两条画布并检查节点和连接；1440×900、1024×768 均无页面异常或横向溢出，截图已检查。
- 初版画布验证没有调用真实模型。本轮已完成真实模型与 WebSearch 调查及 A→B→工作项证据的交接。业务侧因缺当前仓库/部署证据，结果为 incomplete / undetermined；实际输入输出见 [真实测试](evidence/2026-10-22-live/README.md)，执行替身通过不代表业务结论成立。

截图：[材料 1440](evidence/materials-1440.png)、[材料 1024](evidence/materials-1024.png)、[影响 1440](evidence/business-impact-1440.png)、[影响 1024](evidence/business-impact-1024.png)。
