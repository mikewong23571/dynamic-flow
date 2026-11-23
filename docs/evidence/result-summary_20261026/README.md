# 本轮结果契约与工作项结果概览

2026-10-26，本次源码与独立实例验证记录，用户视觉接受仍由用户判断。

## 实际改动

- Definition.summaryOutput 显式绑定具名最终输出；RunResultSummary 必填 title/summary/scope，可选 metrics/limitations/nextAction。普通 aggregate 节点、固定 schema、作者工具与画布配置共用合同。违约按真实节点失败处理，不补造成功报告。
- 工作项先展示本轮摘要和成果分组，再进入共享过程检查器；旧方法只按真实成果分组。历史轮次、固定版本、最新报告及其真实时间分别显示。主入口随执行状态指向进度、失败环节或结果检查。
- 成功执行而未验收显示待复核；重开/换方法后尚未新执行的摘要行 todo 保持 process；条件/结项不由摘要推进。历史成果计数复用 finalArtifacts，包含实际端口条目，不把 NodeResult 当作产物数。
- CVE 模板新增普通函数摘要，统计已有核查记录总数与三类 conclusion，保留逐项目标成果及原集合，不新增模型调用。
- 修复横向步骤导航中 sr-only 状态文字的定位，避免窄屏横向溢出；不删除读屏文本。

## 验证

- 正式类型检查与构建通过；构建仍提示已有 canvas 大体积 chunk。
- 19 项 result-summary/cve-v2/runs/client/functional-author 模块测试通过；11 项工作项分治模块测试通过。作者测试在隔离副本排除继承的部分 Sourcegraph 环境配置，以显式 fixture 验证真实作者工具保存。
- 18 条相关浏览器路线分批通过：result-summary 2、cve-fanout 2、workitem-plan 6、workitem-progress 6、跨方法 workspace 2。修复后针对摘要、CVE、父子推进、结项重开、跨方法操作又合计 10 条通过；方法侧摘要与重开待办 4 条通过；未设置方法 2 条通过。
- 浏览器均为私有 Hono HTTP、独立临时数据与当前 dist，1440×900 / 1024×768；CVE Agent 使用明确 fixture，真实 runtime/HTTP/文件/作者工具交接；本次未重新调用真实模型，未全仓浏览器回归。
- 已实际查看两尺寸的工作项摘要、方法侧摘要、历史提示与 CVE 概览截图。证据为隔离 fixture，不是用户漏洞的业务结论。

## 当前应用交付

源码经逐文件基线检查后同步，保留已有未提交现场；同步前全部方法无 queued/running/stopping Run，未为调试停止或重启托管 systemd 服务。服务保持 active，前端返回 HTTP 200。

当前仓库漏洞核查采用新版本 `7f570fde-30a2-49aa-bbcd-776cacab7760`，旧版本 `1e8401d7-4f84-4c8a-b8e1-d9ee5688a750` 保留。通过正式 saveDraft/adopt/saveLayout 更新，只添加函数摘要及布局；原有 44 轮执行数量、顺序与原定义不变。本次没有创建业务执行或自动确认完成条件。新执行展示新摘要；旧运行保留原格式。

## 截图

- [工作项概览 1440](summary-overview-1440.png) / [1024](summary-overview-1024.png)
- [历史轮次 1440](summary-historical-1440.png) / [1024](summary-historical-1024.png)
- [流水线成果摘要 1440](method-summary-1440.png) / [1024](method-summary-1024.png)
- [CVE 判断分布 1440](cve-overview-1440.png) / [1024](cve-overview-1024.png)
