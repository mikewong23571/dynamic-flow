# Plan — 组件接入摩擦 Spike

## Phase 1 — 依赖与不确定性

- [x] Task: 建立独立 example 工程，安装并锁定候选依赖，记录版本与 peer/engine 问题。
- [x] Task: 检查安装后的真实 API，记录优先验证的集成边界。
- [x] Task: Phase Verification & Checkpoint：验证导入与工具链，保存命令结果。

## Phase 2 — 最小接入样例

- [x] Task: 为消息/工具事件适配和稳定选择身份编写失败测试。
- [x] Task: 实现最小 Pi provider fixture、HTTP/SSE 及 assistant-ui 接入，验证流式与取消。
- [x] Task: 实现分栏、树/图、表格、Monaco 编辑/Diff、结果呈现及 Spike 组合例子。
- [x] Task: Phase Verification & Checkpoint：相关测试、类型检查与构建通过，记录修复。

## Phase 3 — 浏览器与结论

- [x] Task: 实际操作浏览器，检查状态联动、缩放、编辑、比较及取消，保存截图和结果。
- [x] Task: 输出摩擦报告、推荐选型、未验证点、复跑说明。
- [x] Task: Phase Verification & Checkpoint：同步项目文档、提交实验并关闭 track。

## 检查记录

- Phase 1：依赖安装并锁定，官方 shadcn CLI 添加控件。TS7、Table v9、Resizable v4 和 Monaco 0.56 的旧示例/API 差异已记录。
- Phase 2：消息/选择测试先失败后通过。真实 Pi faux provider 执行工具、流式和取消；组件完成最小接入。Monaco Diff 生命周期问题经浏览器发现并修复。
- Phase 3：5 项核心测试、3 条 Chromium 综合路径、typecheck/build/format 全通过；1440/1024 截图已检查。构建产物的编辑/Diff/本地 worker smoke 通过，保留大 chunk 警告。
- 早取消在请求建立前和流式过程中均验证；HTTP 503 状态可见。结果与未验证范围见 results.md。
- 本 track 为选型实验完成，正式 Workbench、真实模型和 Method 执行并未完成。

实验代码与证据提交：`7ed775f`（feat(spike): validate component integrations and record selection friction）。最终文档状态由对应 Conductor closeout 提交记录。
