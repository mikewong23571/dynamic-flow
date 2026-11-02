# 真实模型与最终页面验收（2026-10-22）

本目录为独立验收；所有模型调用使用现有默认 `sangfor/glm-5.3-flash / glm-5.3-flash / max`，无模型替身、未降低思考级别。应用使用真实 HTTP、文件存储、Pi 与 runtime，页面操作使用本地 Playwright。原用户数据仅只读复制，测试使用私有 `/tmp/flowcraft-journey-live-*`。各阶段源码/构建哈希见 `environment-*.json`，不是把全部调用冒充最后一个构建上的重跑。

## 连贯反馈路线

输入与用户选择见 [state.json](state.json)。从页面创建没有方法、没有条件的工作项，输入三条反馈，明确只选 M01/M03：

- M01：界面很顺手，但导出报告经常失败，影响交付。
- M02：希望支持批量导出，逐条操作太慢。（保留但未处理）
- M03：搜索比以前快很多，团队很满意。

1. 页面进入 Assistant，真实模型生成两步分类/汇总方法；[generated-definition.json](generated-definition.json) 保留实际定义。没有在产品内预置反馈流程。
2. 页面明确选 M01/M03 正式运行。首次 M01 完成，M03 因 MCP 失败；错误在页面可见。页面仅重试 M03，预览运行成功。固定输入、失败及重试分别保留，未隐藏错误。
3. 从 F1 成果创建候选，通过页面修改任务要求（明确正面/问题依据），以原始 M01/M03 比较原版与候选。第一次比较受 MCP 限流影响，保留失败证据；离线验收进程省略无关 WebSearch 后再次比较，两个版本四次真实模型调用全部完成，见 [comparison-result.json](comparison-result.json)。未强制模型做出预设分类错误。
4. 页面选择旧 F3 与候选 F1，只正式运行汇总节点。[formal-summary-inputs.json](formal-summary-inputs.json) 保留原对象和来源；[formal-summary-result.json](formal-summary-result.json) 及 [实际汇总报告](feedback-report.md) 为真实输出。分类实例总数前后均 11（含失败实例，不代表 11 次成功调用），无重分类；工作项仍 open。
5. 页面在同一工作项生成独立方法 B，输入规格为 `records` 对象数组，无共享样例。[report-method-definition.json](report-method-definition.json) 是真实生成定义。页面选旧 F3 与候选 F1，完整运行 B；[cross-method-inputs.json](cross-method-inputs.json) 保留结构化对象及 A 的来源，[cross-method-result.json](cross-method-result.json) 为 completed，[实际跨方法报告](cross-method-report.md) 引用两个原文、类别与理由，明确实际收到两条。
6. 最终源码/构建使用已完成反馈数据副本做最终操作（[final-clone.json](final-clone.json)，让另一个仍执行的 CVE max 调用不被重启打断）。页面追溯 A 的来源并返回 B，引用 B 报告到新增条件；修改条件后旧确认/引用失效，再引用和确认，明确结项。随后重开、补 M04，页面只选 M04 进入新一轮准备。[final-lifecycle.json](final-lifecycle.json) 保留结项/重开快照，旧结项依据仍在，当前条件未确认。最终真实验收未提交 M04 模型运行；M04 实际运行及旧 Run 不变由完整 fixture 两尺寸验证，见 [最终确定性路线](../increment-5/README.md)。

真实报告覆盖的是本次明确选择的两条反馈；M02 留存未处理。结项依据明确限定此范围，重开后工作项仍可继续。

## 外部 MCP 的实际失败与取舍

原默认配置下 WebSearch MCP 初始化失败，协议直接诊断返回 HTTP 429，证据 [mcp-connectivity.json](mcp-connectivity.json)。原运行和第一次比较的失败均保留（`feedback-initial-failure.json`、`comparison-rate-limited.json`）。仅在私有离线反馈验收进程省略 WebSearch 环境配置，其余工具与真实 GLM/max 保持；未改应用 MCP 插件、全局模型配置或用户凭据。此后成功不代表 WebSearch 已恢复。

## 现有真实 CVE 材料交接

从已有 CVE A/B 工作空间与工作项只读复制终态数据，见 [cve-baseline.json](cve-baseline.json)。页面选 A 的真实对象给 B，原字符串合同明确拒绝，选择保留且没有新 Run。通过现有 Assistant 编辑所选 B，真实模型将入口与 scope 节点改为接收字符串或对象，其他步骤/边/输出不变，见 [cve-contract-diff.json](cve-contract-diff.json)。

页面使用修正后的保存版本，将 A 原对象正式交给 B 的单个 scope 步骤；[cve-scope-run.json](cve-scope-run.json) 保留精确来源。本轮验证范围是现有材料合同与聚合步骤交接，不是重新执行完整漏洞影响调查、检索或核实两仓库。终态已为 completed，见 [完整运行](cve-scope-result.json)、[实际对象输出](cve-scope-output.json) 和 [验收摘要](cve-scope-validation.json)。本次耗时 22 分 46 秒，仅 scope 执行，包含两个候选系统、8 份来源、4 条未覆盖范围；仓库/revision/环境仍为 null，业务保持 open，见 [工作项终态](cve-final-item.json)。这是材料聚合成功，不等于影响调查已完成。

## 最终两尺寸与响应观测

最终构建、反馈真实产物，1440×900 与 1024×768 本地浏览器操作通过，无页面错误和横向溢出。检查了运行表一 Run 一行、关联工作项、独立成果名、报告正文、过程、来源返回、条件与重开、新输入准备。已实际查看截图：

- [1440 运行表](final-runs-1440.png)、[1024 运行表](final-runs-1024.png)
- [1440 独立报告](final-artifact-1440.png)、[1024 独立报告](final-artifact-1024.png)
- [结项依据](final-completed-1440.png)、[1024 重开状态](final-reopened-1024.png)、[明确仅选 M04](final-new-input-1440.png)

单次小数据观测：打开工作项至成果动作可见 202ms；来源返回 75ms；从运行表打开报告至正文可见 1440 为 110ms、1024 为 66ms。流程/结果/比较切换 135–191ms（含脚本固定 100ms 稳定等待）。见 [final-results-review.json](final-results-review.json)。这不是大数据压测或统计性能保证；没有以本轮消除现有 bundle 体积提示。

## 可重查与脚本说明

`*.cjs` 为真实页面操作证据脚本，存在写入动作，不应直接重复运行创建/启动脚本。`cross-method.cjs` 首次提交后检查曾误把完整范围预期为 undefined，实际 API 为 `full`；修正断言并读取已经创建的 Run 验证，未重复提交。其余早期选择器错误均发生在提交前，保留实际终态为准。测试数据目录与产物保留，服务关闭时移除私有凭据副本；收尾状态见 [cleanup.json](cleanup.json)：两个隔离服务均已停止、私有凭据副本均已删除、测试产物保留；原用户两条 CVE 方法与工作项三份数据哈希均未变。
