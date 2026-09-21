# 模块测试与整体验收

本目录已有正式应用的 node:test + tsx 测试和 Playwright 浏览器用例。继承根约定；历史 `examples/component-spike/` 测试不为正式产品背书。

## 按改动选测试

| 改动 | 最相关的测试入口 |
| --- | --- |
| 文件/定义保存、冲突、材料与流水线维护 | `state.test.ts` |
| 普通运行、失败重试、停止和冻结输入 | `runs.test.ts` |
| 候选比较、同输入、整体取消 | `trials.test.ts`、`client.test.ts` |
| 作者工具、模型设置、节点上下文 | `assistant.test.ts` |
| HTTP/SSE 与模块接线 | `integration.test.ts` |
| 工作项证据、完成条件与关联 | `work-items.test.ts`、`lifecycle-integration.test.ts` |
| 等待、并发、schema、恢复与跨进程行为 | `lifecycle-runtime.test.ts`、`lifecycle-process.test.ts` |
| 纯表达式及作者接线 | `functional-ir.test.ts`、`functional-author.test.ts` |
| 多路集合与前端端口编辑 | `multi-input.test.ts`、`multi-input-author.test.ts`、`multi-input-client.test.ts` |
| 布局、关系聚焦与展示状态持久化 | `canvas-layout.test.ts`、`canvas-focus.test.ts`、`canvas-view-state.test.ts` |
| 上传剖析工作流与导入收尾 | `profile-import.test.ts` |
| 工作区编辑、运行、重开与同工作上下文 | `browser/workspace.spec.ts`、`browser/same-work-reopen.spec.ts`、`browser/opened-pipelines.spec.ts` |
| 管理页与工作项 UI | `browser/work-library.spec.ts`、`browser/workitems.spec.ts`、`browser/management-presentation.spec.ts` |
| 画布、表达式、多路集合 UI | `browser/canvas-layout.spec.ts`、`browser/functional-editor.spec.ts`、`browser/multi-input.spec.ts` |

## 命令与运行环境

从仓库根目录执行：

```sh
# 定向模块验证：替换或追加相关测试文件
pnpm exec tsx --test tests/state.test.ts
# 正式模块与集成测试
pnpm test
# 定向浏览器验证
pnpm test:browser tests/browser/same-work-reopen.spec.ts
# 正式类型与构建
pnpm typecheck:app
pnpm build
```

`pnpm typecheck` 还检查旧实验，错误归属要分开。`pnpm test:browser` 使用根 `playwright.config.ts`，单 worker，默认 1440×900；它可启动 4320/4321，也会复用这两个端口已有的服务。

浏览器用例会经真实 HTTP 创建或修改测试工作；复用已有服务时数据落入该服务的 dataRoot（默认 `data/`）。先读目标用例的 fixture 与清理方式，不清空用户数据。模块与进程测试一般自行创建临时目录；`createApplication({dataRoot, executeNode})` 可为集成测试指定数据目录与确定性模型替身。真实模型探针位于 `src/server/assistant/`，不等同于默认测试命令。

## 证据边界

- 测试具体可观察行为与必要失败边界，不为 export 占位写测试，不以“源码含某字符串”代替行为。
- 不预建测试平台或统一覆盖率门槛；测试用于校准实现，已有用例不代表穷尽所有问题。
- 文件行为用真实临时目录；跨模块变更至少真实连接相邻模块。`lifecycle-process.test.ts` 使用真实子进程验证恢复，但模型仍是替身，不能称为真实模型验收。
- UI 修改实际操作并检查 1440×900 与 1024×768 截图。截图文件存在不等于当前页面已经验证；fixture、真实模型、浏览器结果和用户视觉判断分别报告。
- 按改动跑相关检查；通过后只在新增变更、失败或未消除的疑点需要时扩大/重复测试。文档改动检查路径、符号、命令和差异，无需启动全部业务测试。
- 失败时保留具体输入、实际/预期与受影响合同，修正最小范围；不删断言、缩减业务输入或换假模型维持绿灯。

模块责任见 [实施地图](../docs/implementation-map.md)；用户路线见 [方法工作台 T1–T8](../docs/user-stories.md)、[持续工作项 H1–H11 / L1–L5](../docs/workitem-stories.md)。P01–P32 是 [历史场景索引](../spike/tests/cases.md)，不是当前测试文件清单。实际执行结果、提交、截图和未测边界写入对应 track 的 evidence，不在 AGENTS 固定记录“全部通过”。

## 问题驱动优化的验证

`semantic-workflow.test.ts` 覆盖局部规划校验/执行、原定义不变、固化冲突、展开内等待重开、逐轮持久恢复、停止和上限；`semantic-author.test.ts` 覆盖局部作者工具与问题/合同进入 Pi 边界。`pnpm build && pnpm test:browser tests/browser/semantic-workflow.spec.ts` 用构建后的正式前端和临时数据的私有 HTTP 服务验证两尺寸，模型规划边界为显式替身，不污染用户数据。真实模型探针和证据在 semantic-workflow_20260921 track。
