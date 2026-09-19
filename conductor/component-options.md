# 关键组件选型准备

状态：组件选型讨论中，未安装候选依赖。用户已表达对 assistant-ui 的偏好，Chat 将其列为首选；其余方案仍待决定。本文不是已经批准的实施计划。

分析基于设计稿与官方资料。能力说明属于文档核对；成本、适配性与优先建议属于本项目的工程判断，尚未通过集成原型验证。

## 如何选择

依次判断：能否帮助用户完成工作；交互是否连贯；需要多少衔接代码；用户和 coding agent 是否容易理解、修改；是否真正省去自研工作。

不能只按外观截图、知名度、依赖数量或功能数量选择。可用的小型现成组件通常比自制基础控件更简单；复杂框架也可能把少量代码变成难以理解的适配层。

## 基础 UI：先确定共同语言

| 候选 | 适合之处 | 本项目需要承担的工作 |
| --- | --- | --- |
| [shadcn/ui](https://ui.shadcn.com/docs) | 组件源码进入项目，便于查看和修改；组合方式灵活 | 需要制定自己的控件使用规则和统一视觉，不能逐页随意改组件 |
| [Primer](https://primer.style/product/) | 控件、视觉变量与产品交互规范体系完整 | 需要评估其风格和约定对工作台定制的适配成本 |

初步倾向：优先讨论 shadcn/ui，并借鉴 Primer 的使用规范。理由是代码可见、容易做产品级修改；这不等于默认样式就满足设计要求。

基础 UI 确定后再确定底层 primitives、样式工具和图标来源，避免同时拼装多套按钮、菜单、弹窗系统。

## K1：工作区布局 WorkbenchShell

用户需要在工作地图、主要内容、Inspector 和改法区域之间切换，并保留当前对象上下文。

候选：CSS Grid/Flex 固定或折叠布局；[react-resizable-panels](https://github.com/bvaughn/react-resizable-panels) 可调整分栏。若采用 shadcn/ui，可复用其 [Resizable](https://ui.shadcn.com/docs/components/resizable) 封装，不需另写拖拽分栏机制。

初步倾向：如果可调宽度能明显帮助阅读长结果和源码，复用分栏组件；否则先用固定分栏与折叠。两者均不需要自由拖拽停靠系统。

选型样例：同一个结果从列表打开，展开源码，再进入 Spike 对比，最后返回；检查宽度、滚动、选中状态和窄窗口表现。

决策关键：是否需要用户调整分栏，哪些面板按模式出现，而非永远四栏并列。

## K2：工作地图 WorkMap

用户需要了解阶段、动态展开的位置和真实进展，并从阶段进入某次调用。导航目录和空间关系图承担不同职责。

候选：基础组件组成的阶段目录与实例列表；[React Arborist](https://github.com/jameskerr/react-arborist) 现成树控件，支持展开、键盘导航和自定义呈现；[React Flow](https://reactflow.dev/learn/customization/custom-nodes) 的自定义节点图。树和关系图可按视图配合，不必全部安装。

初步倾向：先评估目录与运行状态能否满足理解；若并行分支和依赖关系确实需要空间展示，则引入 React Flow。图的节点与状态来自程序索引和事件，不另建可独立编辑的执行定义。

选型样例：4 个阶段、50 次明细调用、执行后才出现的 3 个调查主题。应能看到总体进展、定位失败实例、解释尚未发现的工作量。

决策关键：用户是否需要画布缩放和连线。ELK 仅作为复杂图布局的后续候选，不预先加入。

## K3：材料与样本列表 SampleBrowser

用户需要预览真实材料、选择几条样本、按状态找结果，并执行批量试验或保留操作。

候选：基础列表／Table + 复选框；[TanStack Table](https://github.com/TanStack/table) 提供排序、过滤、行选择等 headless 能力，视觉仍由应用负责。

初步倾向：只需 50 条反馈、选择和预览时使用简单列表；出现多列排序、过滤等组合需求再评估 TanStack Table。虚拟滚动不作为 50 条数据的默认前提。

选型样例：选中 #8/#12/#31，改变筛选，打开详情再返回，确认选择身份没有随行位置改变；显示已选数量并支持试运行。

决策关键：材料展示以长文本预览还是多列数据为主；点击打开详情与多选是否清晰区分。

## K4：源码与差异 MethodEditor

用户和 Agent 需要查看具体做法、定位对应函数、编辑候选代码、查看差异与错误。

候选：[Monaco Editor](https://github.com/microsoft/monaco-editor)；[CodeMirror](https://github.com/codemirror/dev) 及其所需扩展。若重点是审阅 Agent 改动，也可比较 [Pierre Diffs](https://diffs.com/docs) 的嵌入式差异呈现；其编辑能力标为 Beta，不能直接视为完整 TypeScript IDE。优先用一个组件覆盖编辑与差异，避免重复引入。

初步倾向：优先验证原稿 Monaco 方案能否直接满足源码定位和代码差异；如果嵌入成本或界面负担不适合原型，再比较 CodeMirror。暂不自研代码编辑器或语义 Diff。

选型样例：点击某次调用定位到源码，修改候选函数，查看 Current / Candidate 代码差异，返回执行结果且不丢失编辑内容。

决策关键：需要多完整的 TypeScript 编辑体验；编辑器加载与分栏缩放是否顺畅。

代码差异只解释代码变化，不代表候选结果质量更好。

## K5：结果检查器 ResultInspector

用户需要围绕一次调用查看输入、结果、公开执行记录及源码，选择重试或修改做法。

候选：所选 UI 体系的 Tabs、列表、Disclosure 等组成业务组件；[react-markdown](https://github.com/remarkjs/react-markdown) 呈现报告；[@uiw/react-json-view](https://github.com/uiwjs/react-json-view) 呈现可折叠结构化数据。若现有 Chat 渲染能力已满足需要，则复用，不重复增加渲染器。独立遥测平台不作为默认产品界面。

初步倾向：直接组合现成控件，自研对象关联。文本、结构化结果、文件各用合适呈现，默认先展示结果而非一屏 JSON。

选型样例：成功、运行中和失败三次调用；用户能找到错误、原始输入和相关工具结果，并在不离开上下文的情况下开始试验。

决策关键：第一版实际产物类型；采用哪些现成渲染器。文件上传、CSV 解析、PDF 文本提取与 PDF 阅读器分别按真实需求选择，不能用“文件组件”笼统代替。

## K6：局部试验与对比 SpikeWorkspace

这是产品核心业务组件。用户需要对同一批样本比较当前与候选结果，分别决定采用方法和保留产物。

候选：复用布局、列表、结果呈现和代码 Diff，组合专用比较区；纯文本差异视图仅适用于适合按文本比较的结果。

初步倾向：自研少量比较与采用逻辑，复用基础呈现。不能拿代码 Diff 代替所有业务结果比较，也不需要为了几条样本接入完整评测平台。

选型样例：3 个样本，其中一个旧结果保留、一个采用候选结果、一个需要继续修改；用户能理解这与“采用新 Method”分别意味着什么。

决策关键：逐样本还是逐字段对比更适合真实材料；长内容如何阅读；历史结果对比和重新运行对照如何区分。

## K7：自然语言修改 MethodAssistant

用户针对当前选中对象提出改法，查看 Agent 的执行与候选修改，接着进入试验。

候选：简单输入区 + 修改记录 + 候选摘要；[assistant-ui](https://www.assistant-ui.com/docs) 等现成对话组件，接入产品事件与 Pi 适配层。

当前首选：assistant-ui。用户明确表示它是较好的 Chat 选型；基于现有消息、流式交互与工具呈现能力，优先复用，不另建完整聊天组件。尚未安装或验证 Pi 集成，其余关键组件也未因此自动确定。

官方能力与集成建议：

- [项目说明](https://github.com/assistant-ui/assistant-ui)：提供可组合聊天 primitives 和可复制到项目的 shadcn/ui 风格组件，支持自有后端。
- [ExternalStoreRuntime](https://www.assistant-ui.com/docs/runtimes/custom/external-store)：适合应用已有消息与事件状态时，通过消息映射和回调接入；无需仅为此引入 Redux 或 Zustand。
- [LocalRuntime](https://www.assistant-ui.com/docs/runtimes/custom/local-runtime)：若暂时没有消息 store，可用自定义适配器先完成请求与流式结果。
- [Tool UI](https://www.assistant-ui.com/docs/tools/tool-ui)：把后端工具调用呈现为自定义 React 内容，可承载候选方法摘要和进入试验的动作。

建议集成路径：Pi Author Session → Workbench 后端事件 → 消息适配层 → assistant-ui。现有材料、选择范围、MethodVersion、Spike 和 Artifact 仍由 Workbench 管理，聊天控件不成为第二份业务事实源。

需要自研的衔接：提交时固定选中范围；映射消息／工具／中止状态；候选版本关联源码；“试运行”“采用方法”“保留结果”调用业务 API。这里是方案推断，不表示已有可直接使用的 Pi 官方连接器。仅为使用该 UI，无需切换到 Next.js 或增加另一套 Agent loop。

选型样例：选中 #8 的 readOne，提交“保留原话并说明失败步骤”，能看到请求针对的范围、正在修改的状态、候选版本，以及“先试”入口。

决策关键：聊天组件的数据模型与 Pi／Workbench 事件映射成本。提供聊天 UI 不等于提供本产品的版本、选择范围和 Spike 业务。

## 支撑组件：前端体验相关但另行选型

| 领域 | 候选方向 | 需要解决的问题 |
| --- | --- | --- |
| 服务端数据与页面状态 | 原稿 TanStack Query；React state/context；必要时 Zustand | 数据更新不丢失选择和编辑内容，避免重复保存同一状态 |
| 程序索引 | TypeScript Compiler API；Babel Parser/Traverse | 入口与源码定位、明确调用识别，不追求任意代码的完整依赖推导 |
| 执行 | Pi SDK + 薄 Runtime、原稿 p-queue | 局部运行、并发、事件、中止；不重建 Agent loop |
| 持久化 | 文件 + JSONL；SQLite 元数据 + 文件 | 保存版本、实验及产物关系时，哪种总实现代码更少、更易理解 |

其中库能力已在前期分析中查阅；本次不安装、不测量性能，不把建议变成定论。候选实现前需要针对具体版本核对接口。

## 建议讨论顺序

1. 基础 UI 体系 + K1 工作区骨架：建立统一视觉和布局语言。
2. K2 工作地图 + K3 样本列表：决定用户如何定位与选择。
3. K4 编辑器 + K5 Inspector + K6 Spike：完成核心检查与改进体验。
4. K7 修改面板，以及支撑这些交互的状态、运行与存储方案。

每组先看具体控件实例，再做选择；仅在文档不足以区分候选时做一个小型集成试验。不要同时搭两套完整应用。

决定后更新 [技术栈](./tech-stack.md)，再规划首个实现 track。
