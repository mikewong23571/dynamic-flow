# 业务工作项

## 快速定位

- 入口：`index.ts` → `createWorkItems(dataRoot, files)`。create/get/list 管身份与视图；addEvidence/criteria/complete/reopen/method 管业务变更；launch/milestone/signal/reconcile 管运行交接。
- 本模块直接保存 `dataRoot/work-items/<id>.json`；经 files 读取方法与运行，launch/signal 的运行回调由 server/index.ts 接线。
- 前端：`client/features/work-items/`；共享记录：WorkItem、WorkItemView、ItemRunRef；HTTP：`/api/items` 及 actions。
- 主要验证：`tests/work-items.test.ts`、`tests/lifecycle-integration.test.ts`、`tests/lifecycle-process.test.ts`、`tests/browser/workitems.spec.ts`。合同见 [生命周期交接](../../../conductor/tracks/workitem-lifecycle_20260920/handoff.md)。

负责 H1/H2/H3/H4/H9/H10/H11：稳定业务身份、目标、完成条件、证据、进展历史和跨方法运行关联。Work 是方法工作空间，WorkItem 是被持续推进的事；不能互相代替。

独立保存在 data/work-items/<id>.json；单进程按工作项串行原子替换，不建通用仓储层。运行状态从关联 Run 读取，业务完成必须显式确认条件与依据。里程碑按 runId+nodeId 去重，普通运行完成不自动结项。progressAt 表示业务事件而非运行心跳。

输入输出为 shared 的 CreateWorkItem/WorkItemView/WorkItemInput。launch 冻结输入并通过参数调用运行器，milestone 是唯一自动业务提交入口；等待/运行/中断未决时禁止换方法和重复发起。补充证据不改变已启动运行。

非目标：CVE 专用判断、权限、分布式存储、通用状态机平台。测试以真实文件、完成依据、跨方法身份和运行关联为准。当前验收见 workitem-lifecycle_20260920 track。

signal 按工作项串行、扫描所有 ItemRunRef 的 Run.signals 做跨运行事件 ID 去重；相同事件返回当前视图，不同内容拒绝。只在未见该 ID 时投给当前运行，避免旧消息唤醒新阶段。启动 reconcile 弥合 Run 已保存但工作项关联未保存的中断；tests/work-items.test.ts 验证关联与里程碑重放不重复。
