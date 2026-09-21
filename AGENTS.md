# 项目工作约定

## 先理解这是什么

Flowcraft 是本地工作流原型：用户在画布或 Assistant 中编辑处理方法，用它推进持续业务工作项，并检查结果、比较改法。当前优先可用、用户友好、实现简单、容易理解和指导修改、coding agent 容易修改。

| 用户概念 / 代码对象 | 负责什么 | 不能混同 |
| --- | --- | --- |
| 流水线 / `Work` | 方法工作空间：标题、目标、样例材料、定义版本、编辑会话、布局和运行记录 | 不是持续业务身份；目录与 API 仍叫 work/works |
| 工作项 / `WorkItem` | 业务编号、目标、独立证据、完成条件、阶段和跨方法历史 | 共用流水线不等于共用业务材料；运行成功不等于业务完成 |
| 执行 / `Run` | 固定定义和输入的一次执行，含实例结果、等待与事件 | 后续编辑或补材料不能改写旧运行 |
| 做法版本 / `Definition` | 画布与 Agent 共同编辑的有限 JS 语义子集 IR | 布局不属于定义；JS 查看只读，不接受任意 JS 反向分析 |

## 按任务找代码

正式代码在 `src/`，一个 React/Vite 前端加一个 Node/Hono 后端；各模块直接调用，不是独立服务。先按下表找到入口，再读对应目录的 AGENTS.md。

| 任务 | 首读入口 / 模块指南 | 相邻模块 |
| --- | --- | --- |
| 页面组装、切换流水线、本地草稿与选择状态 | [前端指南](src/client/AGENTS.md)；`src/client/app/controller.ts`、`src/client/state/` | features/workspace、HTTP/SSE |
| 画布、节点配置、结果、管理页或视觉 | [前端功能地图](src/client/AGENTS.md)；`src/client/features/` | shared、flow、runs |
| HTTP 动作、快照、SSE、启动恢复、导入接线 | [服务入口](src/server/AGENTS.md)；`src/server/index.ts` | 下列业务模块 |
| 流水线列表、命名、归档、材料、保留结果和续做 | [work](src/server/work/AGENTS.md) | files、runs、client |
| 业务工作项、证据、条件依据、里程碑、结项重开 | [work-items](src/server/work-items/AGENTS.md) | files、runs、client |
| 定义保存、版本冲突、端口/表达式/schema 校验 | [flow](src/server/flow/AGENTS.md) | shared、files、assistant、runs |
| 图执行、并发、停止、重试、等待及恢复 | [runs](src/server/runs/AGENTS.md) | flow、files、assistant、work-items |
| Pi、作者工具、模型设置、文件剖析定义 | [assistant](src/server/assistant/AGENTS.md) | flow、files、服务入口 |
| 同样本候选比较与整体停止 | [trials](src/server/trials/AGENTS.md) | runs、files、client |
| 方法文件、不可变定义、上传文件与保存通知 | [files](src/server/files/AGENTS.md)、[数据约定](data/AGENTS.md) | 服务入口、各业务模块 |
| 共用记录、表达式类型与端口语义 | [shared](src/shared/AGENTS.md) | 实际使用这些字段的调用双方 |
| 选择验证命令和测试文件 | [测试地图](tests/AGENTS.md) | 对应模块和真实用户路线 |

## 最短阅读路径

1. 根据本次任务，读 [用户故事](docs/user-stories.md) 或 [持续工作项故事](docs/workitem-stories.md) 的相关段落，再看 [模块与验收地图](docs/implementation-map.md) 对应责任。普通局部修正无需通读所有故事与历史 track。
2. 读 [当前设计](docs/design.md) 的相关语义、[Conductor 索引](conductor/index.md) 和最近的模块 AGENTS。实施状态从 [tracks.md](conductor/tracks.md) 找对应 `plan.md` / `evidence.md`，不要把一个旧 track 当作全仓当前状态。
3. 打开实际入口、调用双方、共享类型与现有相关测试。当前符号和命令以源码、`package.json` 为准；文档过期时同步修正，不把尚未实现的建议写成现状。
4. 前端实施前再看 [设计实例](src/client/DESIGN-NOTES.md)、[控件约定](src/client/components/ui/README.md) 和同类实际组件；实施后实际操作并检查截图。

`docs/` 记录当前合同，`conductor/` 记录任务与证据；`spike/` 是历史伪代码，`examples/component-spike/` 是历史接入实验。正式源码、实验、历史截图和当前验收的证据不能混用。`docs/archive/` 原始 v2 不得改写；旧树优先、Monaco 核心编辑器与 AST 待选型建议已被画布与 IR 设计替代。

## 必须保持的业务边界

- 画布与 Agent 修改同一份 Definition，runtime 执行其明确语义；不建任意源码索引、双向 JS 分析或核心代码编辑器。
- 语义版本、布局、采用做法、保留结果是不同动作。移动节点不使比较过期；采用不自动保留试验产物；续做只用明确选定的输入。
- WorkItem 保持业务身份；等待、里程碑、完成条件和重开遵循 [生命周期交接](conductor/tracks/workitem-lifecycle_20260920/handoff.md)。`Run.completed` 不自动结项，预览不提交业务里程碑。
- 模型失败、保存失败、版本冲突与中断如实呈现；不能靠固定业务答案、假模型或隐藏错误宣称闭环。
- 复用现成组件，代码集中于核心业务语义。职责、明确接口、共享类型、错误处理、必要复用与测试是基本实践；避免无具体需求的通用平台和昂贵抽象。
- 安全、权限、隔离与生产级治理不属于原型范围，不据此扩展计划。保持代码与用户可见概念对应，避免巨大组件和多层通用抽象。
- 前端使用统一控件语义和视觉体系；页面呈现工作内容、状态和动作，避免成片介绍文案，必要标签和错误帮助应清楚。

## 运行与验证

要求 Node 22.19+、pnpm 10（版本以 `package.json` 为准）。

| 命令 | 用途 |
| --- | --- |
| `pnpm install --frozen-lockfile` | 按锁文件安装依赖 |
| `pnpm dev` | 正式前端 4320 + 后端 4321，前端代理 `/api` |
| `pnpm build` | 正式客户端输出到 `dist/`；后端 `pnpm dev:api` 可在 4321 提供构建文件 |
| `pnpm typecheck:app` | 正式源码类型检查 |
| `pnpm test` | `tests/*.test.ts` 正式模块及集成测试 |
| `pnpm test:browser` | 正式 Playwright 浏览器测试；数据与服务复用边界见测试指南 |
| `pnpm typecheck` / `pnpm spike:*` | 前者同时检查旧实验与正式源码；后者只运行历史实验 |

模型目录来自根 `models.toml`（参考 `models.example.toml`），全局默认选择保存到 `data/model-settings.json`，工作对话覆盖保存在 Work；手动/env 回退已移除；不要在输出、提交或快照里暴露密钥。运行数据见 `data/AGENTS.md`。不要把已有用户数据当作可清空的测试夹具。

## 文档维护与交付

模块 AGENTS 用于快速回答“负责什么、从哪进入、与谁交接、如何验证”，根文件只保留全局概念和路由。移动入口、改变接口或验证方式时同步最近的指南；详细语义留在对应 docs，任务过程与历史测试结果留在 track，避免重复堆积交接日志。

按 [术语与编号](docs/glossary.md) 先写业务名称，再附索引；同类说明结构一致、定义与验收对应，区分事实/计划/假设，解释紧邻术语。关键模块变更实施前明确最小输入、输出、错误和具体例子；发现反例时记录具体输入、失效假设、受影响故事和最小验证，再同步调用双方、AGENTS 与测试。模块边界可修订，不为维护骨架削弱业务要求。

交付说明实际改动、相关验证和未测边界。模块测试、相邻模块真实联测、真实模型、浏览器操作与用户视觉判断分别报告；实现存在、类型检查或 mock 通过不代表完整验收。子模块保留的带日期交接、测试数量和勾选是历史记录，不代表当前提交已经重验。持续工作以 H1–H11 / L1–L5 为基线，旧 T1–T8 为回归，实际结论看对应 track 证据。
