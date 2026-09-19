# 前端设计与域内验证

2026-09-20。正式客户端实现；用户最终视觉判断及 T1–T8 由完整应用 track 验收，本文不以截图代替接受。

## 实看的参考与具体取舍

- [React Flow 官方自定义节点实例](https://reactflow.dev/examples/nodes/custom-node)：实际用 Chromium 加载完整交互实例，查看节点、分流连接、缩放与背景网格，截图 [reactflow-official-reference.png](evidence/reactflow-official-reference.png)。采用职责节点与具名 handle；运行实例置于结果视图，不在材料数量增长时复制节点。自定义端口展示业务名称，协议 handle 保持原名。
- [Linear 2026 界面演进](https://linear.app/now/behind-the-latest-design-refresh)：阅读其位置栏和视图栏区分、导航退后与内容优先的具体方案。采用稳定的工作标题/运行操作顶栏，下面独立流程/运行/比较切换；辅助面板不替代主任务视图。没有复制品牌色或整套界面。
- [Primer Button](https://primer.style/product/components/button/)：核对主次操作与状态语义。主要动作使用实色按钮，次要动作描边，低频轻操作无底；禁用、停止处理中、失败有文本表达。采用 Radix Dialog 处理焦点、标题、关闭与模态背景；统一基础控件。
- [assistant-ui ExternalStoreRuntime](https://www.assistant-ui.com/docs/runtimes/custom/external-store)：实际使用外部保存的消息和状态接入会话组件，模型调用由后端完成。无文字的运行态显示生成/修改进行中，工具与错误来自快照。

## 当前方向：Geist 暗色（2026-09-20 用户反馈后）

前一版浅色画布、紫色强调及文字密集节点已被用户否定；下方早期截图仅保留历史验证价值，不代表当前视觉规范。

实看 [Geist 颜色](https://vercel.com/geist/colors) 的 Dark 实例并阅读 [按钮规范](https://vercel.com/geist/button)。沿用现有 React Flow、Radix、assistant-ui，调整其呈现，不引入另一套组件库。

- **重复**：中性暗色背景、6px 控件圆角、1px 边框、32px 常用按钮；表单继承 Geist/系统字体。状态颜色集中在 styles.css 语义变量。
- **对齐**：节点统一 240px 宽、标题预留两行，类型/标题/摘要/端口位置一致；具名端口沿底部左右列排布，协议 ID 不变。
- **对比**：名称是主要信息，类型与处理方式退后；白色主操作，蓝色选中与焦点，绿/红/黄表达完成/失败/提醒。颜色辅以图标或文字。
- **亲密**：图标、类型和名称组成身份区；方式与进度组成状态行；连接点与端口标签相邻。Agent 任务全文放在配置面板，分支仍保留条件摘要。

侧栏展示所有工作、最近五项工作及当前工作资源，材料不再作为侧栏截断文本列表。MaterialsDialog 提供全文、多选、全选/清空和新增入口；工作库承载搜索、分页、重命名、归档。选中材料复用原状态与持久化逻辑。

本次 [验收与截图](../../conductor/tracks/geist-workspace_20260920/evidence.md) 覆盖 1440/1024、真实历史 Agent 内容和函数流程浏览器回归；设计实现已交付，用户审美接受仍由用户判断。

Workspace 负责组合；useWorkspace 维护 HTTP/SSE 与编辑上下文；Sidebar、WorkspaceDialogs、WorkflowCanvas、NodeInspector、Assistant、Results、Comparison 分别对应可见职责。未提交节点定义、对话输入和节点样本选择保存于当前浏览器的工作上下文；正式做法、材料、结果由服务端持久化。

## 实际域内证据

- `pnpm exec tsx --test tests/client.test.ts`：真实换行拆材料；明确输入/端口；比较排序稳定但语义和来源变化过期；旧 revision 不倒灌；删节点清连接/输出；合并输入保留空端口。
- `pnpm typecheck:app`：正式源码类型检查。
- 在真实 HTTP 服务创建独立的前端域内检查工作 `8f27aad4-cf68-4886-a8fe-f26bb346997d`，使用普通 identity 节点运行；不是模型结果。浏览器从节点打开试验，明确三条输入，只运行该节点，显示真实完成结果。
- [1440×900 工作台](evidence/workspace-1440.png)、[1024×768 工作台](evidence/workspace-1024.png)、[1024×768 结果](evidence/results-1024.png)。1024 保持可读缩放，可平移画布或收起配置面板，不缩小字号换取容纳。
- 浏览器检查未发生 pageerror；1024 无页面横向溢出。写入未发送对话→切换配置再返回，正文仍在；修改节点名称但不保存→刷新，未提交草稿和禁用运行状态仍在。

真实模型生成、完整报告、所有 T1–T8 路线与用户视觉接受待根任务记录。域内结果不能代替最终产品验收。

## 追加的 Assistant、设置与列表

- Assistant 使用 assistant-ui 的消息作用域与 ExternalStoreRuntime，消息旁显示实际固定的步骤/样本。工具操作收纳为可展开的中文业务记录；仅已完成保存工具且快照含该定义时显示保存卡。失败重试保留原步骤、原样本；起点版本改变时先明确在当前草稿重试，已删除步骤禁止盲重试。
- [Assistant 1440](evidence/assistant-1440.png) / [Assistant 1024](evidence/assistant-1024.png)。`node src/client/evidence/assistant-ui-check.mjs` 使用**浏览器响应替身**验证状态与实际 POST 请求体，不是模型验证。已检查工具默认不铺开、保存反馈、旧起点重试固定上下文、建议只填 composer、回到画布。
- `ModelSettingsDialog` 对接完整 `ModelConfiguration/ModelSettings`：协议、端点、模型、密钥、推理强度、Temperature、Top P、上下文窗口。密钥框不回显已有值，空白不发送密钥，成功保存后清空；协议限制与支持的推理档位来自后端。
- [模型设置 1440](evidence/model-settings-1440.png) / [模型设置 1024](evidence/model-settings-1024.png)。`node src/client/evidence/model-settings-check.mjs` 是表单**响应替身**检查，验证字段提交、空密钥省略、密码清空与不回显、提示、窄屏与无 pageerror；真实配置持久化/协议调用由根验收。
- 工作列表由状态开发者提供 `WorkLibrary`；工作台集成“所有工作”、最近工作标题、分页组件入口及列表修改后刷新侧栏。列表独立证据由其开发者记录。
- 真实报告发现 Markdown 表格不可读后，Results 与 Assistant 共同接入 GFM；表格在自身容器横向滚动，不使整个页面溢出。

## 持续工作项（2026-09-20）

本轮以 [H1–H11 生命周期故事](../../docs/workitem-stories.md) 扩充，不将旧运行完成解释为业务结项。参考 [Geist Table](https://vercel.com/geist/table) 的可比较列、独立空状态与窄列日期，以及 [Geist Badge](https://vercel.com/geist/badge) 的短状态标签；查看已有 Geist 暗色画布截图后沿用同一色彩、按钮和边框。

- `WorkItems` 是独立管理入口，业务阶段/摘要、等待与执行、最近业务进展各自成列；搜索与业务状态过滤来自 HTTP。窄屏将最近进展时间靠近标题，避免隐藏业务信息。
- `WorkItemDetail` 将目标、进展、条件依据、材料、历史组织在主栏；方法、当前执行、固定版本和跨方法运行记录放辅助栏。完成条件在本地编辑，轮询不覆盖未保存内容；更新失败保留表单。等待展示事件与截止，不展示虚假百分比。
- `WorkItemDialogs` 复用 Radix 模态；创建不复制方法样例材料，工作项自己的材料随运行冻结。详情中的运行链接携带方法 ID 和运行 ID，在该方法快照就绪后选择对应运行。
- `NodeInspector` 支持 Map / FlatMap / Aggregate、并发、单次输入/输出 schema，以及等待/里程碑的明确配置；`WorkflowCanvas` 只呈现运算摘要、事件名称/阶段，详细任务留在 Inspector。
- `Results` 可查看工作项固定输入修订、等待释放方式、接收事件 ID / 时间 / payload。运行成功与工作项结项分别呈现。

域内 `tests/client.test.ts` 7 项通过，`pnpm typecheck:app` 通过。新增真实 HTTP 浏览器路线由整体 track 记录；该记录不将类型检查当作持久恢复或用户视觉验收。

## 管理页整改（2026-09-20）

正式入口修正为 shadcn/Radix + Tailwind4，components.json不再指向旧Spike。管理对象统一为工作项/流水线；列表以标题为主，编号/节点数为辅，业务状态与阶段同组，错误执行突出，修改时间成列，次要操作进入菜单。工作项分页与稳定轮询、流水线键盘Tabs共用实际控件。审计和本轮截图见 [track](../../conductor/tracks/functional-ir-management_20260920/evidence.md)。旧段落描述此前实施过程，“所有工作”命名与旧手写基础控件已被本轮替代。

## 多路连接阅读（2026-09-20）

参考 React Flow 官方 [ELK 多端口实例](https://reactflow.dev/examples/layout/elkjs-multiple-handles) 和 [ELK Layered](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)。沿用现有 Geist 暗色、shadcn 按钮、统一边框/强调色；不以彩虹连线或增加虚构节点解决密度。

重复：同层节点对齐、固定端口顺序。对比：相关连线增强，其他节点仍保留可读轮廓。亲密：端口名紧邻端点，连接说明只在追踪时出现。概览保留摘要/端口数，选中或悬停再显示完整端口名称。整理按钮、关系聚焦、端口显示统一放在画布右上；窄屏保留图标及可访问名称。

布局与定义分离；拖动后允许普通连接降级，用户主动整理后恢复全局路径规划。两尺寸真实操作、截图和边界记录在 [验收证据](../../conductor/tracks/canvas-layout_20260920/evidence.md)。
