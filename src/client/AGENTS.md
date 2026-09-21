# 工作区前端

继承根目录与 `src/AGENTS.md`。本目录承载方法编辑、运行与比较，以及持续业务工作项管理；服务端负责业务状态与执行，浏览器保留编辑和选择上下文。

## 入口与状态流

`main.tsx` → `app/App.tsx` 组装页面；`app/controller.ts` 导出 `useWorkspace()`，返回类型即 `WorkspaceController`。旧的顶层 `Workspace.tsx`、`useWorkspace.ts`、`model.ts` 已拆分，勿按旧文档寻找或重建。

| 位置 | 职责 / 何时修改 |
| --- | --- |
| `app/App.tsx` | 工作项、流水线库、画布工作区的页面组合与导航接线 |
| `app/controller.ts` | 组合域 hook、创建和打开工作；重新打开当前工作保留编辑与选择 |
| `app/CanvasPane.tsx`、`ContextPanel.tsx` | 画布与配置/Assistant 面板组合；面板左缘拖拽调宽（260px–60vw≤640px），宽度存本浏览器 localStorage；同目录 Header/Tabs/Notices/CandidateBar 负责工作区框架 |
| `state/useConnection.ts` | 本地有序打开列表、当前工作 ID、HTTP 快照、SSE 连接及元数据刷新 |
| `state/useDraft.ts` | 未保存定义、dirty/baseId、变更摘要与放弃本地修改 |
| `state/useSelection.ts` | 节点/运行/材料/结果选择，按工作恢复本地上下文与待保存草稿 |
| `state/usePanels.ts` | 标签页、面板、对话框和表单状态 |
| `state/useActions.ts` | 保存、运行、停止、比较、候选、布局等服务端动作及响应处理 |
| `core/` | 可复用的请求与动作辅助（api/action），以及纯逻辑（format/inputs/definition/compare/results/invoke-form）；不在此放 React 状态或执行器 |

`useConnection` 接收 Snapshot → `useDraft` 与 `useSelection` 维护编辑上下文 → features 展示与收集意图 → `useActions` 调用 HTTP → 服务端保存并通过响应/SSE 更新。查看 `core/definition.ts` 的 revision 接受规则与 `useActions` 的工作 ID 检查，避免迟到响应串到其它工作。

工作项与流水线管理页也有各自的数据请求；不要误以为所有页面都经工作区 controller。工作项轮询只读 `/api/items`，其更新走 `/api/items/:id/actions`。

## 按可见功能定位

| 目录 | 核心文件与职责 | 相邻合同 / 主要测试 |
| --- | --- | --- |
| `features/workspace/` | Sidebar 导航；WorkspaceDialogs 组合创建、添加材料、候选起点、试验、续做、只读 JS 和直接输入调用（InvokeDialog）对话框 | controller、state；`tests/browser/same-work-reopen.spec.ts` |
| `features/canvas/` | WorkflowCanvas 编辑图与关系聚焦；WorkflowNode/Edge 展示；canvas-layout 做 ELK 几何计算，useCanvasLayout 管理测量/异步布局/保存，canvas-view 做展示辅助 | shared/node-ports、ViewState、flow.saveLayout；`tests/canvas-*.test.ts`、`tests/browser/canvas-layout.spec.ts` |
| `features/inspector/` | NodeInspector 配置节点；ExpressionEditor/Fields、PatternEditor 编辑纯表达式；CollectionEditor 编辑 merge/collect/join | shared、flow 校验；`tests/multi-input-client.test.ts`、`tests/browser/functional-editor.spec.ts`、`tests/browser/multi-input.spec.ts` |
| `features/assistant/` | Assistant、AssistantMessage：请求上下文、消息、工具活动与保存反馈。Composer 约束：IME composition 期间不得向父级 setState 同步草稿（重渲染会被 Chromium 强制提交组合、候选框闪断），组合结束才回写；`useExternalStoreRuntime` 的 store 对象须保持稳定引用（useMemo + 回调走 ref），否则每次渲染 setAdapter 通知全部订阅者 | assistant-ui、服务端 assistant；`tests/browser/workspace.spec.ts` 与真实作者证据 |
| `features/results/` | Results 展示运行/实例/来源；Comparison 展示同输入两侧结果与有效性 | core/inputs、compare、results；`tests/client.test.ts`、`tests/trials.test.ts` |
| `features/library/` | WorkLibrary：搜索、分页、重命名、归档恢复与打开流水线 | work.listWorks；`tests/browser/work-library.spec.ts` |
| `features/work-items/` | WorkItems 总览、WorkItemDetail 详情、WorkItemDialogs 业务动作 | work-items、Run 关联；`tests/browser/workitems.spec.ts` |
| `features/materials/` | MaterialsDialog：材料全文与样本选择 | Work 材料、useSelection |
| `features/settings/` | ModelSettingsDialog / CatalogManager：模型目录管理、全局默认与工作覆盖 | assistant/settings、`/api/config` |
| `components/` | Management 管理页骨架、MarkdownTable、ui.tsx 兼容层与 ui/ 控件 | [控件约定](components/ui/README.md)、`tests/browser/management-presentation.spec.ts` |
| `styles.css`、功能目录 CSS | 全局主题/状态色/布局与就近功能外观 | [设计实例](DESIGN-NOTES.md)、1440×900 与 1024×768 实际操作和截图 |

侧栏“已打开的流水线”由 `useConnection` 维护，本浏览器 `dynamic-flow.opened-works` 保存有序入口；打开新项追加，已有项只选中，快照仅原位更新元数据。Sidebar 不截取前五项，列表可滚动；每行关闭按钮只移除入口，不停止/归档/删除，不清除草稿。controller 关闭当前项时优先选右邻项、否则左邻项，无剩余项回到“全部流水线”；useSelection 在离开时保存上下文，重开可恢复。旧数据仅迁移保存的当前 workId，不导入最近库列表。归档移除入口，恢复归档需再次打开。流水线库排序仍来自服务端 `work.listWorks`，工作项管理页另有保留行序逻辑。回归见 `tests/browser/opened-pipelines.spec.ts`。

## 编辑与业务边界

- `Snapshot` 是服务端事实，未提交定义是浏览器编辑状态。SSE 不覆盖 dirty 草稿；保存带 `expectedDraftId`，冲突保留本地内容并提示。本地上下文按 workId 存储，不把草稿提升为另一份服务端权威状态。
- 作者请求固定发送时的节点、样本与定义；发送后切换选择不改变该请求。工具实际保存才展示已修改，不能仅凭回复文本更新图。
- Work 为流水线方法，WorkItem 为独立业务身份，Run 固定版本和输入。运行链接同时保留 workId/runId；完成、换方法、等待与恢复以服务端校验为准，禁用按钮只是提示。
- 采用做法与保留结果独立；比较因语义/输入变化过期，布局/排序变化不影响有效性。结果必须能回到原版本、输入和运行。
- 文件来源节点从 uploads 选择文件名；创建/添加材料支持上传后触发 `importMaterials`。浏览器不解析格式，剖析走服务端内建工作流。
- 前端不 import server 执行代码、不运行 Pi、不复制求值器。`expression-model` / `collection-model` 是编辑辅助；复用 `shared/node-ports.ts` 的端口语义。
- 改名/删除集合端口同步连接和具名 schema 的顶层 properties/required（collect 也同步输出 schema），不自动改写任意嵌套 schema 或下游表达式。
- 工作项列表轮询更新已有行而不自动重排；新行追加，显式搜索/筛选重新排序。业务进展显示 `progressAt`，不能用心跳替代。
- 模型密钥不放 localStorage、列表或响应展示；设置保存不代表端点验证成功。

## 画布与视觉约定

画布是主要编辑入口，JS 只读；不建页面 DSL、自由停靠平台或独立前端业务副本。只显示节点摘要，任务全文由 Inspector 编辑。

布局与 IR 分离：首次无保存位置可自动整理；已有位置尊重用户选择，运行/SSE 不重排。手动移动取消待完成布局，端口/尺寸/位置/连接变化使旧路由失效，暂用普通边，主动整理后重算。布局只保存 ViewState，不创建 Definition；隐藏端口名仍保留真实 handle 几何。具体语义见 [布局 track](../../conductor/tracks/canvas-layout_20260920/spec.md)。

采用 Geist 暗色及正式 shadcn/Radix/Tailwind/Lucide 控件。修改前先读 [DESIGN-NOTES.md](DESIGN-NOTES.md)、[控件 README](components/ui/README.md) 和同类组件；旧浅色/紫色 Spike 截图不作模板。黑底 `#000`，结构线 `--line`，表单/卡片线 `--line-strong`，标题 `--ink-strong`；状态色集中在 styles.css，不在功能 CSS 重定义。

styles.css 的业务布局在 `@layer components`，原生默认在 `@layer base`；存量 `.muted/.field/.button/.badge/.modal` 及第三方覆盖仍有未分层规则，原因见文件头。不可仅为整理把它们包进 layer 而改变层叠优先级。Geist 经 Fontsource 本地打包；Vite 忽略 data、conductor、测试报告目录，避免写证据造成刷新循环。

## 验证入口

从 [测试地图](../../tests/AGENTS.md) 选择相关域与浏览器用例；UI 变更必须实际操作并检查两尺寸截图，编译不能替代体验。真实模型、fixture 和用户视觉判断分别记录。

当前合同：[用户故事](../../docs/user-stories.md)、[生命周期](../../docs/workitem-stories.md)、[纯表达式](../../docs/functional-ir.md)、[多路集合](../../docs/multi-input.md)。历史与当前验收从 [track 注册表](../../conductor/tracks.md) 定位，不将以前通过记录视为本次测试结果。

## 模型目录界面交接


ModelSettingsDialog 是模型管理入口；目录（models.toml）是唯一配置来源，手动/env 回退已于 2026-09-20 按用户决定移除：「默认模型」区块（别名+强度，改完即存 PUT /api/config/default，行内「已保存」反馈）、CatalogManager（provider 卡片就地展开编辑，删除两步确认；「新增 Provider / 新增模型 / 添加请求头」统一在各区头右侧；整份 PUT /api/config/catalog，密钥框留空沿用、custom_headers 未动沿用且每行可移除，逐模型「测试」走 POST /api/config/test 行内显示结果；长值字段如服务地址/API 密钥独占整行，短值才两栏；模型卡片默认折叠、新增自动展开）。思考级别词表为 off/minimal/low/medium/high/xhigh/max（与运行时 thinkingLevel 对齐，覆盖 OpenAI none=off、Claude、Kimi、GLM），编辑器里 Thinking efforts 是整行勾选（off 可勾 = 允许运行时选择不思考；全不选 = 不设置思考级别），Default effort 下拉跟随勾选集合；非法值由服务端给出中文错误。composer footer 的 ModelSelector 是本工作对话覆盖切换器（受控：无覆盖时选中「跟随默认」项，POST /api/works/:id/model-selection 后由快照刷新；目录为空或配置未加载时隐藏）。组件源码 vendor 自 @assistant-ui/model-selector registry（components/assistant-ui/model-selector.tsx，受控模式，不走它的 ModelContext 链路；连带 components/ui/popover.tsx、command.tsx 与 cmdk 依赖，import 已按项目约定改写）。强度展示统一英文。消息与节点结果小字展示 effectiveModel（含"所选模型已失效，实际使用 xxx"回退标注）；助手与节点失败处有「检查模型设置」按钮打开该对话框。

## 问题与动态执行 Review

画布工具栏“问题与依据”打开 `inspector/SemanticFields.tsx` 的 ProblemEditor，写入同一 Definition；节点的 SemanticFields 编辑责任、完成条件、依据、角色、动态边界和有限迭代。业务文案为逐项/整批处理，operation 仍是内部传输字段。Results 用 shared/expansion 投影历史 Run 的实际子图，显示规划提案、局部展开、逐轮结果与固定问题认知，可把已完成展开写成候选；原定义和运行不变。浏览器测试 semantic-workflow.spec.ts 使用临时目录和真实私有 HTTP 服务（模型为明确替身），先 pnpm build，两尺寸截图存本轮 track。

比较结果通过 core/results.comparisonResult 沿 sourceResultIds 回溯冻结样本，排除 planning 和 intermediate，展示所选责任的最终结果；展开子图的整批输出也能关联原样本。生成子步骤的改进入口回到原动态责任，不能选择原定义中不存在的节点。
