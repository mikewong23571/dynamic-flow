# 唯一工作项流程与业务工作界面

当前状态：**in-progress，页面能力已对齐并完成增量交付**。2026-11-02已补齐组合/逐项动作/就近任务及显式工具、收敛外壳；真实Assistant无预写模板生成，使用反馈后自行改进，实际补交产生新运行、原处更新。a062635已发布4320/4321且保留现有数据；307模块和23条受影响浏览器通过，最终1440/1024已实看；证据与限制见evidence/page-capabilities。主代理独立推进。

上一版产品已于2026-10-30部署托管4320/4321，并按授权清理15个旧Work目录、1118个WorkItem和2个批次，保留模型配置。不能继续沿用“尚未部署/未删除数据”的旧状态；已部署不等于业务方案被接受。

预览已修正为持久目录`.flowcraft-preview-data/`，原4335示例可读取；旧4333停用。此次从浏览器快照恢复了可用工作区，原始会话/独立工具文件的损失见[恢复记录](evidence/page-capabilities/persistence-recovery.json)。

- [系统准则及建立者/Assistant职责](../../../docs/workitem-system-principles.md)
- [当前重做方案与具体场景](work-surface-redesign.md)
- [问题和目标](spec.md)
- [实施计划](plan.md)
- [验收合同](acceptance.md)
- [实际部署记录](deployment.md)
- [现状与决定](documentation.md)
- [唯一数据和命令合同](../../../docs/workitem-openui-flow.md)
- [清理边界](cleanup.md)
- [框架依据](framework.md)

Assistant应按本项业务组织界面，帮助用户理解和参与工作；OpenUI为实现细节。业务数据、来源及旧运行仍保持唯一权威，不引入领域页面平台或第二状态机。
