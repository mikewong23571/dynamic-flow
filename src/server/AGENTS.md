# 单进程后端与模块组装

适用本目录，子目录各有 AGENTS。当前仅骨架，HTTP 服务与业务均未实现。

## 职责与目标

本目录 index.ts 将来承担 Hono HTTP/SSE、具体函数接线与启动恢复。六个功能目录分别实现其子问题，直接调用，不增加 controller/service/repository 套层。

内部依赖：work → files/runs；flow → files；runs → flow/assistant/files；assistant → flow/files；trials → runs/files；files 不反向依赖业务。该关系是当前避免循环的组织方式，不是永不可改的分层规则。

外部依赖：入口用 hono、@hono/node-server；Pi 只经 assistant 接入；文件 IO 在 files；普通逻辑使用 TypeScript。shared 提供少量共享记录。见 [完整依赖](../../spike/pi-canvas-dependencies.md)。

## 非目标

不建独立服务集群、消息队列、通用路由/事件框架、第二个 Agent loop 或鉴权隔离平台。

## 接口与验收

- 按 [功能接口](../../spike/interfaces.md) 暴露直接操作；精确 HTTP 路径在首个真实调用中确定，必要时同步前端。
- 长任务返回 ID，SSE 发真实状态；业务保存成功后才生成含实际定义的工作快照，工具完成文本不能冒充图更新。
- [ ] P23/P31：连入/重连取得完整定义和运行状态，操作回执不会倒灌旧快照。
- [ ] P29/P30：Pi → 工具 → 保存 → 快照 → Canvas 与节点活动链实际联通。
- [ ] P08/P21：取消与启动恢复到达真正调用和保存状态，不只返回 HTTP 200。

服务入口实现者负责跨模块接线与集成证据；不得把“模块测试各自通过”当作该项通过。

## 假设与未知

先一个进程和小规模工作状态；SSE 消息大小、更新频率和真实 Pi 回调时序仍待验证。不为了原图成立而把断线、乱序或 SDK 不兼容隐藏到假的成功事件中。先复现最小问题，再修改必要交接。
