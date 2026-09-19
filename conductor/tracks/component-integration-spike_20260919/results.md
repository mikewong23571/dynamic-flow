# 组件接入 Spike 结果

实验日期：2026-09-19 至 2026-09-20。范围：example 级接入与选型判断。

后续用户反馈（2026-09-20）：当前界面的组件呈现、样式和色彩不被接受。本文的通过结论仅指技术接入与列出的操作验证，不代表正式产品设计通过；该 example 不得直接作为正式视觉基线。后续设计要求见 [产品指南](../../product-guidelines.md)。

## 结论

可以大量复用现成组件完成这个原型。assistant-ui + Pi 的接入成立，不必增加第二套 Agent loop，也不需要为 Chat 改用 Next.js。基础工作区、表格、编辑器和结果呈现都能组合起来。

但“只写核心业务”仍需要少量可见的衔接代码：运行事件映射、选择快照、编辑器生命周期、对象关联、候选与产物的独立采用规则。现成控件能省掉通用机制，不能替产品决定这些语义。本轮未发现需要先建设通用前端框架、全局状态平台或执行平台的证据。

最大的**已观察接入摩擦是 Monaco 的版本组合**；最大的**仍未消除的不确定性是 Method 的真实执行、源码定位及版本/产物关联**。UI 实验通过不能替后者作保证。

推荐首先确定 React/Vite/TypeScript、shadcn/ui、assistant-ui、Hono + SSE、Pi SDK、react-resizable-panels。表格建议采用 TanStack，但固定 v9 用法；编辑器可以保留 Monaco，接受本报告中的适配与体积代价。React Flow 暂不进入默认产品依赖；树按层级需求决定，不能因为实验安装了就全部保留。

## 实测与判断

“低”表示普通组件组合即可；“中”表示存在必须明确的状态/API 衔接；“较高”表示已碰到运行问题或明显成本。不是跨项目通用评分。

| 组件 | 实际版本 | 接入结果 / 摩擦 | 建议 |
| --- | --- | --- | --- |
| React / Vite / TypeScript | 19.3.0 / 8.3.0 / 7.0.2 | 编译、开发服务、浏览器通过；TS7 移除 `baseUrl`，旧 tsconfig 失败 | 保留，锁版本；不用旧脚手架配置直接拼接 |
| shadcn/ui / Radix / Tailwind | CLI 生成 Button、Tabs、Checkbox；Radix 1.6.7、Tailwind 4.3.3 | 低；官方 CLI 成功，仍需统一 tokens、布局、密度和动作层级 | 建议采用；生成组件源码在仓库，容易修改 |
| assistant-ui | react 0.15.21 / markdown 0.14.16 | 中；真实流式、工具卡片、停止、错误状态均跑通 | 建议采用 ExternalStoreRuntime |
| Pi SDK | pi-ai / pi-coding-agent 0.85.1 | 中；真实 AgentSession 工具执行、后续回复、取消、两个独立会话通过 | 保留；真实模型、会话恢复尚未验证 |
| Hono / Node adapter | 4.13.8 / 2.1.1 | 低；POST 请求 + SSE 响应、取消接口、运行清理通过 | 目前足够；无需加 WebSocket 或 Agent 服务框架 |
| react-resizable-panels | 4.12.4 | 低；拖动与窗口缩放通过，v4 API 与常见旧示例不同 | 建议采用，避免自行实现拖拽分栏 |
| TanStack Table | 9.2.4 | 中；排序、多选、筛选后身份保持通过；v8 示例不兼容 | 多列表格采用；简单材料列表不强制使用 |
| React Arborist | 3.16.0 | 中；受控选择、展开、方向键/空格操作通过；默认偏文件树语义 | 有真正层级和键盘导航需求时采用；少量阶段目录可先更简单 |
| React Flow | 12.11.6 | 接入低、产品语义不确定；三个静态节点、选择与树联动通过 | 延后；不把业务运行状态复制成独立图编辑模型 |
| Monaco / React wrapper | 0.56.0 / 4.7.0 | 较高；导出路径、语言注册、Diff 卸载、worker 与体积均有摩擦，修复后通过 | 可采用，但不能标为零成本；暂不叠加另一个 Diff 库 |
| react-markdown | 10.1.0 | 低；Inspector Markdown 实际渲染 | 建议采用；Chat 使用 assistant-ui 对应渲染器 |
| @uiw/react-json-view | 2.0.0-alpha.43 | 低；折叠展示通过，但当前安装版本仍带 alpha 标记 | 可选，浅层 JSON 不必为此设必选项；锁版本 |
| Spike 对比工作区 | 业务组合 | 结果对齐、采用 Method 与保留产物分开；编辑使旧比较过期 | 自研这些业务状态，复用表格/布局/Diff；不引入整套评测平台 |

所有直接依赖与工具准确版本见 [安装清单](../../../examples/component-spike/evidence/versions.json) 和根目录锁文件。这里的建议不自动等于正式产品最终定案。

## 关键摩擦及处理

### 1. assistant-ui 不需要 Pi 专属连接器，但需要明确消息所有权

路径已经实际运行：`AgentSession → Hono SSE → 消息 reducer → ExternalStoreRuntime → primitives`。

- 安装版本中，自定义消息必须提供 `convertMessage`；不能照搬缺少该项的示例。
- 工具参数需要 JSON 兼容类型；Markdown primitive 用小 React 组件包裹后作为 Text renderer。
- 工具完成后追加文字必须保留原工具 part，不能用每次文本更新覆盖整个消息。
- 停止按钮必须调用后端 `session.abort()`，仅中断浏览器读取不等于停止 Agent。
- 发送时复制样本 ID；生成过程中用户修改当前选择不会改变本轮请求。
- Tabs 保持已有视图挂载，保留对话和草稿；编辑器首次访问才加载。

这部分代码在 `src/chat.tsx` 和 `src/bridge.ts`，没有新增 Redux/Zustand、AI SDK 或另一个 Agent loop。当前只映射本实验所需的文本、工具、完成、取消和错误；不是完整 Pi 协议转换器。

### 2. Pi 可以做真实 SDK 实验，不用伪造前端事件

发现 SDK 自带 `fauxProvider`。响应内容固定，但 AgentSession、模型流处理、工具执行和 abort 是真实 SDK 行为。测试验证先调用 `inspect_sample` 再继续回复，而非浏览器定时器演示。

显式配置了 ModelRuntime、内存会话/设置、自定义工具和 ResourceLoader；实验使用临时目录且结束清理，避免环境中的个人配置影响结果。`tools` 在当前版本是名称数组，工具定义放 `customTools`。每个请求独立创建 provider 与 runtime；并发测试确认一方取消不影响另一方。

未调用真实模型、未评估模型质量/成本/重试；每次发送是新的 Pi 会话，浏览器中的历史没有回传成跨轮上下文。正式 Chat 还需要明确作者会话的生命周期，但不应再造 Agent loop。

### 3. TanStack v9 的一次性学习成本真实存在

`useReactTable` 旧示例不适用于当前包；本例使用 `useTable`、`tableFeatures`、显式排序/选择 feature、`table.FlexRender`。选择类型是 `Record<string, true>`，不是包含 false 的稀疏布尔表。

必须用业务 ID `getRowId`，把跨组件使用的选择状态交给 React；Inspector 当前查看对象与批量样本选择分开。筛选在 React `useMemo` 中完成，未额外启用 Table 的过滤 feature。排序、筛选隐藏/恢复后选择保持，已经浏览器验证。

建议给 coding agent 固定版本与一个已运行的本地参考，避免不断混入 v8 代码。没有证据需要降级；也没有测试旧版，因此不声称旧版更稳。

### 4. Monaco 的问题不能用类型检查代替浏览器验证

按实际出现顺序记录：

1. `monaco-editor/esm/vs/...` 旧导入路径被 0.56 的 exports 规则拦住，类型检查失败。
2. 最小 editor API 导入虽然能显示文字，但补语言注册时出现 `UNKNOWN service IOutlineModelService` 等服务注册错误。最终用包根入口和本地 worker 配置；不声称已找到最小体积导入组合。
3. `@monaco-editor/react` 的 Diff 切换抛出 `TextModel got disposed before DiffEditorWidget model got reset`。最终编辑区仍用 React wrapper，Diff 用一个薄 React 生命周期适配直接调用 Monaco：先 `setModel(null)`，再 dispose widget 和 models。没有自研 Diff 算法。
4. Vite 首次优化新增 Monaco 依赖会重载页面；明确 `optimizeDeps.include`，消除实验首次进入编辑器时的额外重载。
5. 仅看到 worker 创建不够。浏览器实际输入类型错误、等待错误标记、修正后标记消失；同时验证编辑、切换、Diff 和缩放。

构建仍有大 chunk 警告。观测到 TS worker 约 **6.93 MB**（未压缩构建文件）；主 UI JS 约 **1.11 MB**，Monaco editor API chunk 约 **2.65 MB**。这不是首屏总下载量或加载时间测量。代码面板按首次访问加载；根入口仍产出额外语言/worker 资源。本轮不继续做构建裁剪优化。

因此 Monaco 的建议是“能力吻合、已能运行、代价明确”，不是“集成无摩擦”。若产品主要审阅少量改动而非写代码，再单独比较 CodeMirror/Pierre Diffs；本轮没安装它们，不能给出实测优劣。

### 5. 地图的主要风险是产品表达，而非画布能力

树和图共享一个节点 ID，单独负责呈现；选中图节点后切回树，状态保持。React Flow 要求有实际高度的容器，本例提供明确尺寸。

Arborist 默认 Enter 对应重命名；关闭编辑后 Enter 不会自然变成“打开详情”。实测方向键移动焦点、空格选择可用。正式导航需要确定键盘激活语义。

本例只有一个根/三个阶段，没有验证 50 次调用、动态展开、大图布局、虚拟化性能。React Flow 的成功接入不能证明关系图是合适的默认用户界面；目前优先树/列表，等真实并行关系确实难以理解再加画布。

## 视觉与交互

参考已有 [产品指南](../../product-guidelines.md) 中 Linear 布局、Primer 控件语义/渐进展示、VS Code 工作区职责，以及 shadcn 实际生成控件。此次采用统一间距与绿色动作色，主要空间给样本/源码；用 Tabs 区分工作区、代码比较与 Assistant，不让所有面板同时挤满屏幕。

用户详情与多选使用不同动作；原始 JSON/工具信息可折叠；“采用候选 Method”和“保留示例产物”独立且有可见状态。1440 和 1024 宽度均操作并检查截图。此页面是控件实验，不是最终产品视觉定稿。

## 验证证据

- `pnpm install --frozen-lockfile`：锁文件可安装；没有依赖 peer 冲突阻断。安装提示 node-domexception 弃用及部分依赖构建脚本被忽略；本轮路径正常，未 blanket approve 这些脚本。
- `pnpm test`：5 项通过，覆盖消息合并、选择快照、真实 Pi 工具/流式/取消、并发会话独立。
- `pnpm typecheck`、`pnpm build`、`pnpm format:check`：通过，构建体积警告保留。
- `pnpm test:browser`：3 条 Chromium 综合路径通过；包含排序/筛选/查看/多选、树图切换、键盘、拖动、1024 窗口、代码编辑/诊断/Diff、独立采用动作、Chat 工具/流式/取消（包括请求建立前的取消）、HTTP 503。测试检查页面异常；没有开展完整浏览器兼容性或性能基准。
- 构建产物额外 smoke：Monaco 编辑、Diff、本地 worker 和 API 代理通过，页面异常为空；见 [产物检查](../../../examples/component-spike/evidence/production-smoke.json)。
- 初次 Playwright MCP 浏览器扩展连接超时，改用项目内 Playwright Chromium；不是跳过浏览器检查。

输出：[验证命令记录](../../../examples/component-spike/evidence/checks.txt)、[浏览器记录](../../../examples/component-spike/evidence/browser-run.txt)、[结构化结果](../../../examples/component-spike/evidence/browser-results.json)。

截图：[工作区](../../../examples/component-spike/evidence/workspace.png)、[1024 窗口](../../../examples/component-spike/evidence/workspace-1024.png)、[图](../../../examples/component-spike/evidence/graph.png)、[代码 Diff](../../../examples/component-spike/evidence/code-diff.png)、[Chat](../../../examples/component-spike/evidence/chat-complete.png)、[取消](../../../examples/component-spike/evidence/chat-cancelled.png)。

## 尚未消除的不确定性

| 问题 | 为什么重要 | 下一次最小验证方式 |
| --- | --- | --- |
| Method 如何绑定局部试验范围 | 不能把控件上的选中范围误当可执行子程序 | 一个真实 TS Method、两个 agent 调用点、三个样本；只重跑指定调用点 |
| 运行事件如何定位源码与版本 | 地图和 Inspector 必须指向真实程序，不能维护第二份图定义 | 固定 MethodVersion + siteId + 源码位置，验证一次编辑后的重新索引 |
| 历史产物、候选结果与采用方法的关系 | 本例的两个布尔状态只验证交互概念，没验证续做规则 | 保存一次比较，采用 Method 而保留旧产物，再继续执行 |
| Pi 跨轮作者会话与真实模型 | 当前固定响应无法证明真实 Agent 修改代码的可靠性 | 一个真实 provider、两轮修改、一个工具失败/取消恢复路径 |
| 文件还是 SQLite 更简单 | 这轮没有存储，自然不能得出持久化选型结论 | 用同一组 Method/Run/Artifact 查询与更新比较总业务代码量 |

这些不确定性比再挑一套按钮库更值得下一轮投入。本轮到此收口，不扩大成正式产品实现。

## 可复跑入口及资料

[Example README](../../../examples/component-spike/README.md) 提供全部命令与边界。主要 API 依据为已安装包的类型声明/源码和随包提供的 TanStack v9 skills，结合官方资料：

- [assistant-ui ExternalStoreRuntime](https://www.assistant-ui.com/docs/runtimes/custom/external-store)、[Tool UI](https://www.assistant-ui.com/docs/tools/tool-ui)
- [Pi SDK](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)
- [shadcn/ui](https://ui.shadcn.com/docs)、[Resizable](https://ui.shadcn.com/docs/components/resizable)
- [TanStack Table](https://github.com/TanStack/table)、[React Arborist](https://github.com/jameskerr/react-arborist)、[React Flow](https://reactflow.dev/)
- [Monaco](https://github.com/microsoft/monaco-editor)、[Monaco React wrapper](https://github.com/suren-atoyan/monaco-react)

官方能力说明与本项目工程建议分别看待；表内“实测”只覆盖本文列出的样例路径。
