# 工作区前端

适用本目录。正式工作区已实现；继承 src/AGENTS.md。

## 职责与目标

承载 A–G 故事的实际操作。一个工作区共享工作、选中节点、样本、运行版本和候选上下文；按任务组合画布、配置、结果、对话和比较。

用户要能不写代码完成：创建任务、改流程、查看执行、定位问题、少量试验、采用做法/保留结果、续做与重开。

## 非目标

不建设通用页面 DSL、自由停靠平台或独立前端业务副本；不从自然语言推断图变更，不在浏览器调用 Pi，不复制旧 Spike 的廉价视觉。

## 入口与依赖

入口为 main.tsx/Workspace.tsx；状态与 HTTP/SSE 交接位于 useWorkspace.ts，按画布、配置、结果、对话、比较、设置、工作库拆分组件。

依赖服务端的具体操作与状态快照，通过 shared 类型交接，不直接 import server 执行代码。外部复用 React、@xyflow/react、assistant-ui、shadcn/Radix/Tailwind/Lucide；Markdown、表格、分栏按内容需要使用。详见 [依赖说明](../../spike/pi-canvas-dependencies.md) 和 [交互伪代码](../../spike/src/client/workspace.pseudo.md)。

## 验收与证据

下文编号只是查阅索引：P 表示具体测试场景，T 表示完整用户验收路线；含义见 [术语与编号](../../docs/glossary.md)。

- [x] 目标和材料可输入，流程可读可改，局部错误可修，长结果和报告可读可复制（场景 P01–P05/P10/P11）。
- [x] 对话固定发送上下文；比较输入/版本正确；过期可辨；采用与保留独立（场景 P12–P19）。
- [x] 运行、停止、失败、重开与断线状态真实，不丢未提交输入和必要选择（场景 P07–P09/P21/P23）。
- [x] 工具实改后画布与 Inspector 更新；工具活动属于正确实例；新定义快照不重置视口，删选中节点后无悬空详情（场景 P29–P31）。
- [x] 研究真实成熟界面、统一视觉方向，在 1440×900 与 1024×768 检查 T1/T3/T5 代表内容并提供截图；用户审美接受不由工程验收代替（场景 P25/T8）。

模块实现者负责把上述行为连接到后端验证；静态页面、组件安装或 mock 事件不算完成。最终 T1–T8 由当前产品交付任务整体验收。

## 假设与未知

画布主入口已经确定；当前布局、面板密度和结果呈现已有真实截图；大图体验尚未做规模验证。不要把当前伪代码布局当成已获用户认可；先做真实代表页面，根据反馈迭代，必要时调整组件边界。本清单不穷尽未知。

## 2026-09-20 实现交接

正式入口 main.tsx/Workspace.tsx 已实现。工作区状态与 HTTP/SSE 在 useWorkspace.ts；画布、节点配置、结果、比较、Assistant、设置、工作列表按可见职责分开。设计参考、截图、域内已测与未测见 [DESIGN-NOTES.md](./DESIGN-NOTES.md)。上方勾选依据整个应用 track 的真实路线与浏览器记录；响应替身与真实模型证据分开。

客户端不会将流式快照覆盖未保存草稿；未提交定义、对话和样本上下文按工作保存在浏览器。服务端版本变化时保留本地内容并显示冲突，显式保存通过 expectedDraftId 校验。图布局与定义分离，默认可读缩放；外部更新保留当前视口。模型配置中 API key 只在密码框内短暂输入，不放本地存储、列表或响应展示。

产品级验证与边界见 [本轮验收证据](../../conductor/tracks/full-application_20260920/evidence.md)。

最新视觉方向与证据见 [Geist 暗色工作区 track](../../conductor/tracks/geist-workspace_20260920/evidence.md)。默认暗色，语义颜色集中在 styles.css；Sidebar 负责紧凑工作导航，MaterialsDialog 负责材料全文和选择；WorkflowCanvas 只展示节点摘要，任务全文由 NodeInspector 编辑。旧浅色/紫色截图不作为新页面模板。

## 持续工作项交接

`WorkItems` / `WorkItemDetail` / `WorkItemDialogs` 承载 H1–H11 的管理入口、业务进展、条件依据和生命周期操作，HTTP 交接见 [本轮 handoff](../../conductor/tracks/workitem-lifecycle_20260920/handoff.md)。Work 仍为方法空间，WorkItem 有独立材料和稳定业务身份，Run 是固定输入/版本的具体执行。不要把运行完成映射为业务结项，或用心跳更新时间替代最近业务进展。

管理页轮询只读 `/api/items`；用户更新均通过 actions，出错保留输入。等待、事件、停止、恢复、方法切换的约束以服务端为准，前端禁用仅用于动作提示。运行链接须同时保持 workId/runId，避免同名方法或历史方法切换到错误执行记录。

## 管理页与控件交接

正式 shadcn/Radix 控件在 `components/ui/`，接入与主题约定见该目录 README；`components/ui.tsx` 为既有业务调用提供薄兼容层。新增控件优先复用这里的 primitives，不继续给全局原生元素叠样式。

用户可见入口统一为“工作项 / 流水线”。流水线归档标签为“未归档 / 已归档”，不把未归档叫进行中；定义状态、节点数来自服务端 summary。两页共享 Management 页头、搜索提交、分页和 Table，业务字段与动作留在各自页面。工作项每次轮询更新已有行，不因服务端进展排序变化自动移动阅读中的行；新行追加，显式搜索/筛选重新取得顺序。当前为客户端分页（不宣称服务端规模优化）。

## 纯表达式编辑交接

NodeInspector 的数据变换使用 ExpressionEditor、PatternEditor 和 ExpressionFields：常用和嵌套语义均通过控件编辑；对象/数组常量也可选择JSON输入，但不是构造对象/数组的必经入口。expression-model只提供显示名、默认对象和纯编辑辅助函数，不复制服务端求值器。操作与语义见 [纯函数 IR](../../docs/functional-ir.md)。

## 多路组合编辑

CollectionEditor / collection-model 负责merge/collect动态端口及join模式、路径、重复策略，复用shared/node-ports和正式控件；变更端口后更新React Flow internals。改名/删除同步目标连线及具名Schema顶层properties/required，collect输出Schema同样处理；不自动改写任意嵌套Schema或下游表达式。局部试验选择实际端口，集合函数固定整批。tests/multi-input-client.test.ts 与 tests/browser/multi-input.spec.ts 覆盖交接。

Geist Variable通过Fontsource本地打包，中文保留系统回退。Vite忽略conductor/test-results/playwright-report/data，防止测试trace的HTML触发持续刷新；不能把开发工具循环误判为应用逻辑或字体网络失败。

## 画布布局与连接阅读

`canvas-layout.ts` 复用 ELK Layered / Orthogonal，根据 React Flow 实测节点和端口返回坐标、折点；端口位置固定，不为减少交叉改写 IR。`useCanvasLayout` 负责测量、布局请求、过期结果和展示状态保存；`WorkflowCanvas` 负责图编辑与关系聚焦；`WorkflowNode` / `WorkflowEdge` 分别负责节点、实际路径及路径标签。

无保存位置时首次自动整理，已有位置尊重用户选择；运行/SSE不重排。手动移动取消尚未完成的布局，端口、尺寸、位置或连接变化让旧路由失效，暂用普通边，点击“整理布局”重新计算。布局只保存 ViewState，不创建定义版本。端口标签按需显示但保留真实handle几何；键盘/悬停可追踪单一端口，选择节点显示直接关系。V1–V4 验收见 [本轮 track](../../conductor/tracks/canvas-layout_20260920/evidence.md)。
