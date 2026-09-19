# 技术栈与决策状态

当前架构依据：[简化设计 v3](../docs/design.md)。组件版本以 package.json / pnpm-lock.yaml 为准；现有安装服务于历史 Spike，不能照单复制到正式产品。

## 当前方向

| 领域 | 选择 / 边界 | 证据状态 |
| --- | --- | --- |
| 工作流定义 | JS 语义子集 IR，显式节点/连接/输入输出；只读 JS 表示 | 新设计，尚未实现 |
| 工作流执行 | Node 上的薄 runtime，解释有限节点语义并调用 Pi/JS 函数 | 新 IR 调度尚未验证；不构建通用 JS 解释器 |
| 主画布 | React Flow 12.11.6；nodeId 直接对应 IR | 已验证静态图/选择；拖拽连线回写 IR 与执行联动待测 |
| 前端 | React 19.3.0、Vite 8.3.0、TypeScript 7.0.2 | 已运行；TS7 配置差异已处理 |
| 基础控件 | shadcn/ui、Radix、Tailwind、Lucide | 技术接入通过；Spike 视觉被否定，正式页面重新设计 |
| 对话 | assistant-ui 0.15.21，ExternalStoreRuntime | 用户首选；工具、流式与取消已测，修改 IR 工具待实现 |
| Agent | Pi SDK 0.85.1 | 真实 SDK + faux provider 已测；真实模型与作者跨轮会话待测 |
| API / 更新 | Hono + HTTP / SSE | 已试接；新节点事件关联待实现 |
| 分栏 | react-resizable-panels 4.12.4，按需使用 | 拖动与窗口缩放已测，不做自由停靠 |
| 材料/结果 | TanStack Table 9.2.4 按多列需求使用；react-markdown 报告 | 选择/排序/筛选和渲染已测 |
| 状态 | React state 起步；IR 与运行数据明确区分 | 小型示例已测，暂无全局 store 平台需求 |
| 持久化 | 本地定义/元数据/结果文件 + 追加事件记录 | 设计选择，尚未实现；SQLite 延后 |

IR 中 agent/function/branch 与逐项模式的确切字段，在下一个最小 runtime 实验中固化。普通处理复用已有 JS 函数；不要把所有控制逻辑变成 Agent 循环，也不要用硬编码业务分类替代 Agent 节点职责。

## 不进入当前产品主路径

- Monaco / 代码 Diff：保留旧实验，不作为核心编辑入口；只读定义查看不要求完整 IDE。
- React Arborist：保留旧实验，不再推荐树/IDE Outline 作为主要流程表达。
- Babel、recast、通用 TypeScript AST 索引：不再是待选项；IR 已直接提供结构与节点身份。
- Pierre Diffs、CodeMirror、多套源码编辑器：不继续为已删除的核心需求做选型。
- 复杂调度框架、隐式结果缓存、通用事件回放、额外 Agent loop、monorepo 多包：不预建。
- JSON viewer 仅在真实结果结构需要时采用，不作为默认节点详情。

## 下一轮接入验证

同一 IR 载入/保存 → 画布编辑回写 → runtime 实际执行 → 节点/样本事件定位 → 单节点试验与候选结果比较。补一个条件分流/空集合案例；验证执行版本固定、结果来源与刷新恢复。模型 fixture 和真实模型证据分开记录。

历史 [Spike 报告](./tracks/component-integration-spike_20260919/results.md) 中“Monaco 保留”“React Flow 延后”“程序索引待选”的建议已被当前设计替代；包接入失败/修复与截图记录仍有效。

## 工具与命令

pnpm 10.32.1；Node 实测 24.14.0，Pi 包要求 >=22.19；node:test + tsx、Playwright Chromium、Prettier。命令见 [workflow.md](./workflow.md) 与 [实验 README](../examples/component-spike/README.md)。

不为安全、权限、隔离或生产治理扩展原型工具链。当前架构仍需实测，不把设计决定写成实现完成。
