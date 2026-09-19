# 单进程后端与模块组装

适用本目录，子目录各有 AGENTS。当前为正式 Hono HTTP/SSE 与业务模块组装入口。

## 职责与目标

本目录 index.ts 承担 Hono HTTP/SSE、具体函数接线与启动恢复。六个功能目录分别实现其子问题，直接调用，不增加 controller/service/repository 套层。

内部依赖：work → files；flow → files；runs → flow 校验/files；模型执行由入口传入 assistant.executeNode；assistant → flow/files；trials → runs/files；files 不反向依赖业务。该关系是当前避免循环的组织方式，不是永不可改的分层规则。

外部依赖：入口用 hono、@hono/node-server；Pi 只经 assistant 接入；文件 IO 在 files；普通逻辑使用 TypeScript。shared 提供少量共享记录。见 [完整依赖](../../spike/pi-canvas-dependencies.md)。

## 非目标

不建独立服务集群、消息队列、通用路由/事件框架、第二个 Agent loop 或鉴权隔离平台。

## 接口与验收

- 按 [功能接口](../../spike/interfaces.md) 暴露直接操作；实际路径以 index.ts 为准：/api/config、/api/works、/api/works/:id/actions、preview-results 与 events。返回 Snapshot 含 Work、定义和校验问题；错误返回 error 和可选 issues。
- 长任务返回 ID，SSE 发真实状态；业务保存成功后才生成含实际定义的工作快照，工具完成文本不能冒充图更新。
- [x] 连入/重连取得完整定义和运行状态，操作回执不会倒灌旧快照（场景 P23/P31）。
- [x] Pi → 工具 → 保存 → 快照 → Canvas 与节点活动链实际联通（场景 P29/P30）。
- [x] 取消与启动恢复到达真正调用和保存状态，不只返回 HTTP 200（场景 P08/P21）。

服务入口实现者负责跨模块接线与集成证据；不得把“模块测试各自通过”当作该项通过。

## 假设与未知

单进程、小规模工作状态；SSE 保存通知合并 50ms，15s 心跳，按 revision 接受完整快照；已测断连重连与真实工具保存。大数据量性能尚未做压力测试。不为了原图成立而把断线、乱序或 SDK 不兼容隐藏到假的成功事件中。先复现最小问题，再修改必要交接。

产品级验证与边界见 [本轮验收证据](../../conductor/tracks/full-application_20260920/evidence.md)。
