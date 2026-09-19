# 技术栈与决策状态

当前架构依据：[设计 v3](../docs/design.md)。正式应用位于 src/，版本以 package.json / pnpm-lock.yaml 为准。安装列表同时保留历史实验依赖，不能把包存在等同于正式产品已采用。

## 正式实现

| 领域       | 已实现选择 / 边界                                                                  | 证据与限制                                                  |
| ---------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 工作流定义 | 共享 Definition 类型；显式节点、连接、输入输出，不可变 JS 文件；只读 JS 查看       | flow/files 已实现；验收结论见当前 track                     |
| 工作流执行 | Node 上的有限语义 runtime；agent/function/branch、each/all、空分支、停止与局部重试 | runs 调度 Pi/普通函数，不构建通用 JS 解释器                 |
| 主画布     | React Flow 12.11.6；稳定 nodeId、具名端口、连线和配置回写 IR                       | 布局与执行语义分离；保留保存视口；实际操作证据分开记录      |
| 前端       | React 19.3.0、Vite 8.3.0、TypeScript 7.0.2                                         | 正式入口 main.tsx/Workspace.tsx                             |
| 基础控件   | 统一 Button/字段语义、Radix Dialog、Lucide、集中 CSS 变量；Vite 接 Tailwind        | 重新设计正式工作台，不沿用被否定的 Spike 视觉               |
| 对话       | assistant-ui 0.15.21，ExternalStoreRuntime/Thread/Composer                         | 固定请求上下文、流式消息、紧凑工具记录、保存反馈与重试      |
| Agent      | Pi SDK 0.85.1；作者与执行会话分开                                                  | 真实调用和 fixture 分别记录；工具实际保存流程与检查结果     |
| 模型设置   | 环境初值 + data/model-settings.json；三种协议映射和参数验证                        | 前端设置对话框已接入；保存不代表端点已通过验证              |
| API / 更新 | Hono + HTTP / SSE 完整 Snapshot                                                    | 快照包含定义、运行、结果与消息；revision 防倒灌             |
| 工作库     | work 列表 API + WorkLibrary；搜索、分页、重命名、归档恢复                          | 标题与目标分离，手改标题不被作者覆盖                        |
| 材料/结果  | 原生选择列表与业务结果组件；react-markdown + remark-gfm                            | 报告表格在自身容器滚动；无需核心代码编辑器                  |
| 状态       | React state/useWorkspace；服务端快照与未提交编辑分开                               | 浏览器保存本地编辑/样本上下文，正式业务状态以服务端文件为准 |
| 持久化     | 每工作 work.json + definitions/ 下不可变 JS 定义文件                               | 已实现文件保存与启动时中断状态处理；不引入数据库            |

IR 字段已落在 [shared/records.ts](../src/shared/records.ts)，模块接口见 [实施交接](./tracks/full-application_20260920/handoff.md)。普通处理提供原样传递、字段选择与合并；模型节点仍由 Pi 执行，不用硬编码业务分类替代。

## 不进入当前产品主路径

- Monaco / 代码 Diff：保留旧实验，不作为核心编辑入口；只读定义查看不要求完整 IDE。
- React Arborist：保留旧实验，不再推荐树/IDE Outline 作为主要流程表达。
- Babel、recast、通用 TypeScript AST 索引：不再是待选项；IR 已直接提供结构与节点身份。
- Pierre Diffs、CodeMirror、多套源码编辑器：不继续为已删除的核心需求做选型。
- 复杂调度框架、隐式结果缓存、通用事件回放、额外 Agent loop、monorepo 多包：不预建。
- JSON viewer 仅在真实结果结构需要时采用，不作为默认节点详情。

## 实现与验收分开

正式模块已经接线；继续按 T1–T8 检查从输入、画布修改、执行、比较到续做与重开的真实路径，并记录模型设置/工作库维护的 G1/G2 证据。类型检查、模块 fixture、真实模型、浏览器操作和用户视觉判断分别报告，具体结论统一见 [当前 track](./tracks/full-application_20260920/evidence.md)。

历史 [Spike 报告](./tracks/component-integration-spike_20260919/results.md) 中“Monaco 保留”“React Flow 延后”“程序索引待选”的建议已被当前设计替代；原有失败/修复记录仍保留为历史证据。

## 工具与命令

默认命令已经面向正式应用：

| 命令                         | 当前用途                                 |
| ---------------------------- | ---------------------------------------- |
| pnpm dev / dev:api / dev:web | 启动正式 Node/Hono 后端与 Vite 前端      |
| pnpm build                   | 构建正式客户端到 dist/                   |
| pnpm test                    | 运行 tests/ 下正式模块与 HTTP 测试       |
| pnpm test:browser            | 运行 tests/browser/ 下正式浏览器用例     |
| pnpm typecheck:app           | 检查 src/ 正式源码                       |
| pnpm typecheck               | 同时检查旧实验与正式源码                 |
| pnpm format:check            | 检查正式源码、测试与根配置格式           |
| pnpm spike:*                 | 单独运行历史组件实验，不作为正式产品验收 |

pnpm 10.32.1；Pi 包要求 Node >=22.19，当前开发环境使用 Node 24.14.0。测试复用 node:test + tsx、Playwright Chromium，格式化使用 Prettier。启动与模型配置见 [根 README](../README.md)。

TanStack Table、react-resizable-panels、Monaco、Arborist 等仍在安装清单中，其中未进入当前正式客户端的依赖不视为已采用。原型不为安全、权限、隔离或生产治理扩展工具链。
