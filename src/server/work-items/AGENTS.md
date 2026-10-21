# 业务工作项

## 快速定位

- 入口：`index.ts` → `createWorkItems(dataRoot, files)`。create/get/list 管身份与视图；addEvidence/criteria/complete/reopen/method 管业务变更；launch/milestone/reportProgress/signal/reconcile 管运行交接。
- 本模块直接保存 `dataRoot/work-items/<id>.json`；经 files 读取方法与运行，launch/signal 的运行回调由 server/index.ts 接线。
- 前端：`client/features/work-items/`；共享记录：WorkItem、WorkItemView、ItemRunRef；HTTP：`/api/items` 及 actions。
- 主要验证：`tests/workitem-progress.test.ts`、`tests/work-items.test.ts`、`tests/lifecycle-integration.test.ts`、`tests/lifecycle-process.test.ts`、`tests/browser/workitems.spec.ts`。合同见 [生命周期交接](../../../conductor/tracks/workitem-lifecycle_20260920/handoff.md)。

负责 H1/H2/H3/H4/H9/H10/H11：稳定业务身份、目标、完成条件、证据、进展历史和跨方法运行关联。Work 是方法工作空间，WorkItem 是被持续推进的事；不能互相代替。

独立保存在 data/work-items/<id>.json；单进程按工作项串行原子替换，不建通用仓储层。运行状态从关联 Run 读取，业务完成必须显式确认条件与依据。里程碑按 runId+nodeId 去重，普通运行完成不自动结项。progressAt 表示业务事件而非运行心跳。

输入输出为 shared 的 CreateWorkItem/WorkItemView/WorkItemInput。launch 冻结输入并通过参数调用运行器，milestone 与正式执行 Agent 的 reportProgress 分别记录执行阶段和模型报告；等待/运行/中断未决时禁止换方法和重复发起。补充证据不改变已启动运行。

非目标：CVE 专用判断、权限、分布式存储、通用状态机平台。测试以真实文件、完成依据、跨方法身份和运行关联为准。当前验收见 workitem-lifecycle_20260920 track。

signal 按工作项串行、扫描所有 ItemRunRef 的 Run.signals 做跨运行事件 ID 去重；相同事件返回当前视图，不同内容拒绝。只在未见该 ID 时投给当前运行，避免旧消息唤醒新阶段。启动 reconcile 弥合 Run 已保存但工作项关联未保存的中断；tests/work-items.test.ts 验证关联与里程碑重放不重复。


## 工作项推进总览与报告

list 返回 `{items,total,summary}`：summary 在搜索和状态筛选前从同批视图统计全部工作项，含 total/pending/open/running/waiting/attention/completed；`status=pending` 是所有未结项项，不是持久业务状态。total 仍为当前匹配数。

WorkItem.nextAction/blocker 是可选当前报告字段，旧文件缺失仍正常读取。展示状态先看已结项，再看活动/等待、失败/中断/取消，空闲且有 blocker 才显示需处理。execution.activeNodes 从关联 Run 固定定义与已保存展开投影活动名称、责任及原动态责任名称；execution.error 无 Run 级错误时返回失败实例的错误。查询不更新 progressAt。

`reportProgress(id,{id,stage,summary,nextAction?,blocker?,materialIds?,expectedRevision?,source?},signal?)` 在同项串行和原子保存路径写入当前进展与完整 progress 历史。source 固定 workId/runId/definitionId/nodeId/instanceId，必须指向当前 full/commit、非比较、未停止运行中的普通活动 Agent 实例；材料仅允许本轮冻结输入。没有 source 的外部报告只允许没有未决运行并匹配 expectedRevision。相同报告 ID/内容重试返回当前视图，不增加 revision/history/progressAt；冲突、迟到、保存失败明确报错。保存前重读运行，防止等待定义读取时发生停止后迟到写入。

例如阶段“影响调查”、摘要“已整理公告”、blocker“缺版本”、nextAction“补版本清单”只表示报告已保存，不确认完成条件、不结项，也不创建 RunWait。里程碑与报告共存，Agent/外部来源分开记录。新运行、关联恢复、换方法、结项、重开或里程碑替代时清除旧 nextAction/blocker，旧内容仍留历史。工具接线与真实文件/HTTP/运行边界见 `tests/workitem-progress.test.ts`；真实模型与浏览器证据见当前 track。
