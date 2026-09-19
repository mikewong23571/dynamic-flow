# 前端设计与域内验证

2026-09-20。正式客户端实现；用户最终视觉判断及 T1–T8 由完整应用 track 验收，本文不以截图代替接受。

## 实看的参考与具体取舍

- [React Flow 官方自定义节点实例](https://reactflow.dev/examples/nodes/custom-node)：实际用 Chromium 加载完整交互实例，查看节点、分流连接、缩放与背景网格，截图 [reactflow-official-reference.png](evidence/reactflow-official-reference.png)。采用职责节点与具名 handle；运行实例置于结果视图，不在材料数量增长时复制节点。自定义端口展示业务名称，协议 handle 保持原名。
- [Linear 2026 界面演进](https://linear.app/now/behind-the-latest-design-refresh)：阅读其位置栏和视图栏区分、导航退后与内容优先的具体方案。采用稳定的工作标题/运行操作顶栏，下面独立流程/运行/比较切换；辅助面板不替代主任务视图。没有复制品牌色或整套界面。
- [Primer Button](https://primer.style/product/components/button/)：核对主次操作与状态语义。主要动作使用实色按钮，次要动作描边，低频轻操作无底；禁用、停止处理中、失败有文本表达。采用 Radix Dialog 处理焦点、标题、关闭与模态背景；统一基础控件。
- [assistant-ui ExternalStoreRuntime](https://www.assistant-ui.com/docs/runtimes/custom/external-store)：实际使用外部保存的消息和状态接入会话组件，模型调用由后端完成。无文字的运行态显示生成/修改进行中，工具与错误来自快照。

## 最终方向

深墨导航、浅色画布、白色内容，紫色用于主要动作和候选。材料正文 13px、节点任务 13px、具名端口 12px、节点标题 16px；新画布默认 100% 缩放和折行节点布局，避免为容纳全图将正文压缩到无法阅读。用户保存的坐标与缩放优先，流式定义不重置视口。

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
