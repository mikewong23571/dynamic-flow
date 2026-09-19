# Plan — AGENTS 驱动的模块代码骨架

## Phase 1 — 子问题与模块责任

- [x] Task: 建立模块 AGENTS、目录与最小源码入口。
- [x] Task: 建立模块验收和跨模块闭环对应，记录假设与调整方式。
- [x] Task: Phase Verification & Checkpoint：检查用户故事覆盖和边界可修订性。

## Phase 2 — 检查与交付

- [x] Task: 接入独立源码类型检查，更新导航和源码/伪代码/历史实验状态。
- [x] Task: Phase Verification & Checkpoint：类型/格式、目录及链接、31 个场景归属、归档摘要与 diff 检查。
- [~] Task: 记录检查证据并提交；明确业务模块仍未实现。

本轮是骨架与说明文档任务，不编写仅验证占位文件的业务单元测试；功能测试在相应用户路径开始实现时补齐。

## 验证记录（2026-09-20）

- 创建 src 下 9 个 TypeScript/TSX 空模块入口；src、各功能目录、tests、data 都有就近 AGENTS。
- 模块与验收地图为 P01–P31 分配牵头及联测责任；既有 19 个故事覆盖关系仍完整。
- 本地脚本检查目录、模块说明所需条目及 77 个链接，全部有效；原稿 SHA-256 未变。
- `pnpm typecheck` 通过，包含旧实验与 `pnpm typecheck:app`。
- `pnpm format:check:app` 与 package.json 的 Prettier 检查通过；首次 tsconfig 格式提示已按格式化工具修正。
- `git diff --check` 通过；data 运行内容被 Git 忽略，AGENTS 保留可跟踪；未改动密钥配置、旧实验代码、依赖或锁文件。
- 无业务实现、无 UI 挂载、无真实模型请求；未运行旧实验业务测试或创建空测试来冒充新产品验收。

代码入口可检查只表示骨架有效。所有业务模块与 T1–T8 仍未实现/未验收；下一步须从真实纵向路径校准接口和边界。
