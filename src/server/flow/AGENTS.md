# 流程草稿、校验与采用

## 快速定位

| 文件 | 负责什么 | 主要验证（仓库根 tests/） |
| --- | --- | --- |
| `index.ts` | checkDefinition/validateForRun、createFlow；草稿、候选、布局、采用、Snapshot | state.test.ts、canvas-view-state.test.ts |
| `schema.ts` | Ajv schema 编译、值校验及可确定的顶层类型冲突；runs/assistant 也复用 | lifecycle-runtime.test.ts、assistant.test.ts |
| `expressions.ts` | 表达式形状/作用域检查与纯求值；求值由 runs 调用 | functional-ir.test.ts、functional-author.test.ts |
| `collections.ts` | merge/collect/join 配置和端口 schema 检查；集合执行在 runs/collections.ts | multi-input.test.ts、multi-input-author.test.ts |

共同端口规则在 `shared/node-ports.ts`。语义先读 [纯表达式](../../../docs/functional-ir.md) / [多路集合](../../../docs/multi-input.md)，再读相应实现；新增节点/运算须同步 shared、runs、作者工具与前端配置。

适用本目录，继承上层约定。当前已实现本模块业务；域内证据与产品联测边界见文末实现交接。

## 职责与子问题

人的画布操作与 Agent 修改，如何成为同一份可执行、可比较的做法？负责草稿保存、节点/参数/连接变化、配置问题、布局另存和采用/放弃。故事：B1–B4、E1、E4、F1。

## 目标

- 手工与 update_flow 使用同一保存入口；旧请求不能覆盖新修改。
- 语义修改产生新定义，布局修改不改变版本或比较有效性。
- 不完整草稿可保存，不能冒充可运行；采用不改写历史结果。

## 非目标

不分析任意 JS、反编译画布，不做任意代码编译器、通用 patch DSL 或自动冲突合并，不执行模型。

## 接口与依赖

提供 beginCandidate（明确改进起点与已有草稿处理）、saveDraft(workId, expectedDraftId, definition)、saveLayout、checkDefinition、validateForRun、adopt、discardDraft。校验返回节点/连接/字段与处理说明。

仅直接依赖 files，校验和差异用普通函数；不引入 Babel/recast。参考 [伪代码](../../../spike/src/server/flow.pseudo.md)。确切类型在真实调用中校准。

## 验收与证据

下文编号只是查阅索引：P 表示具体测试场景，T 表示完整用户验收路线；含义见 [术语与编号](../../../docs/glossary.md)。

- [x] 改变连线确实改变运行输入；无效端口/环能定位并修复（场景 P04/P05）。
- [x] 旧 expectedDraftId 不覆盖新草稿；移动位置不创建新语义版本（场景 P13/P17；真实临时目录域内测试）。
- [x] 采用与保留独立；坏提案不能冒充已保存（场景 P18/P26）。
- [x] 与 assistant/files/server/client 联测工具实改画布，不能只证明 saveDraft 被调用（场景 P29）。

- [x] 历史问题明确选择候选起点，不静默丢弃已有草稿；起点持久化（场景 P32；后端域内测试，历史结果到 UI 起点操作仍待联测）。

## 假设与未知

固定节点/端口与有限条件尚未充分验证。真实条件、合并或输入结构无法表达时，先用最小反例修订定义，不能靠 UI 假连线维持原设计。本清单不穷尽未知。

从历史结果开始改进时，必须明确所选版本；已有不同草稿不能被默默替换。具体 d1/d2/d3 场景与起点字段见对应伪代码。

## 2026-09-20 实现交接

已实现 `createFlow(files): FlowService`，确切方法签名见本目录 index.ts 与 track 的 handoff.md。`saveDraft` 检查 expectedDraftId，两次交错修改只有一方成功；语义相同沿用 ID。形状错误拒绝保存，缺配置、无效端口和回连作为 `Issue` 保留在可编辑草稿，运行/采用需先通过校验。`beginCandidate` 检查本工作定义，保留明确起点，替换已有未采用草稿需 `replaceExisting=true`；继续同一草稿保留原起点。采用与放弃不删除历史。

file 来源节点（kind:file, file.name 非空）无入边、输出 output；定义存在 file 来源节点时 inputs 可为空，否则仍需至少一个非空不重复输入名。

当前端口：普通节点 input/output；branch input → matched/unmatched；merge left/right → output。每个目标端口仅一条来源。条件 field 为空字符串表示判断整个 value，非空字段由 runtime 读取；这是文本材料直接分流的具体需要，影响 B2/T2，已与 runs 实现者同步并加入域内有效定义测试。旧伪代码 match/rest 不再是实际接口。

域内证据：`pnpm exec tsx --test tests/state.test.ts` 验证冲突、起点、保存不完整配置、局部问题、环、显式汇合和布局不改版本。状态为 **模块实现完成，产品联测待验收**；连线实际输入、Pi 改图和浏览器操作交由相邻模块与根验收。

产品级验证与边界见 [本轮验收证据](../../../conductor/tracks/full-application_20260920/evidence.md)。

## 生命周期与类型组合（2026-09-20）

新增 wait(input → output/event)、milestone(input → output)。wait 要求事件名与原因，可设正数 timeoutSeconds；milestone 要求 stage/summary，不自动结项。operation map/flatMap/aggregate 描述调用组合，concurrency 限 1–8；控制节点仅允许 aggregate。Ajv 检查 schema 可编译，runtime 校验实际输入输出。静态连线只拒绝显然不相容的基础类型，不能视为完整 JSON Schema 子类型证明；复杂约束和引用仍由实际运行校验。历史定义缺省 operation 时通过 each/all 兼容，旧函数透传行为保留。

Schema 当前使用 Ajv 的 JSON Schema draft-07，允许基础类型 union；未知 keyword（包括拼写错误）和未安装的 format 明确报错，不静默忽略。未承诺 draft-2020-12 或自定义词汇支持。

控制节点 wait / milestone / branch 的 expectedOutput 统一约束整批透传值数组（分支在分流前校验）；连线上的各个值仍为数组元素 T，静态检查取 items 推断，不能把 T[] 当作每项 T。wait 的 event 端口独立，不使用透传输出的 schema。


## 纯函数 IR（2026-09-20）

`expressions.ts` 提供 `checkExpression(unknown): {field,message}[]` 和 `evaluateExpression(Expression, Json): Json`。共享序列化类型见 `src/shared/expressions.ts`，具体合同见本轮 `functional-ir-management_20260920/spec.md`。functionName=expression 必须显式指定 operation；草稿可保存未完成表达式，运行与 Assistant update_flow 必须通过同一校验，问题字段以 expression 开始并由 checkDefinition 加 nodeId。

支持 pipe、集合 map/filter/flatMap、有初值的顺序 reduce、let 解构和有序 match/guard/otherwise。模式使用 wildcard/bind/literal/type/object/array；对象子集、数组精确或前缀/rest，模式内重复变量及 reduce 累加器冲突明确拒绝。变量为词法作用域，可遮蔽外层；input 是实际节点参数，pipe 每步 value 是前一步值。字段路径仅访问自身 JSON 属性，缺失与 null 区分。纯函数严格参数个数和类型，无隐式转换；equal 按结构比较，忽略对象字段顺序；and/or 和其它 call 一样先求值所有参数，不承诺短路。

实现边界是最多 2000 个语法/字面值条目、64 层嵌套、每次 100000 次表达式求值；错误明确提示缩小表达式/输入。此为原型可解释执行的边界，不是通用语言或隔离平台。结果无输入别名，无任意 JS、闭包、递归或模型调用。

域内证据 `tests/functional-ir.test.ts` 覆盖组合语义、空集合、守卫、解构、词法作用域、错误路径、纯运算、真实文件保存重开、schema 拒绝和下游阻断。作者接线另见 `tests/functional-author.test.ts`；真实模型、结构化画布编辑和视觉验收由本轮 track 汇总，不能由求值器测试替代。

## 多路集合函数（2026-09-20）

正式端口语义共用 `src/shared/node-ports.ts`。`merge` 必须配置 `inputNames`，支持至少两路具名输入。`collect` 要求 `inputNames`，`join` 固定 left/right；集合函数统一聚合，operation 只能省略或 aggregate。`collections.ts` 校验具名端口唯一、join 类型/路径/重复键策略并返回字段问题；坏字段类型不会令校验崩溃。

集合函数 inputSchema 检查 `{端口名: 值数组}`；静态连接按 `properties[端口].items` 的明确顶层类型拒绝冲突。新 merge / join 的 expectedOutput 检查整个数组，但端口发出数组中的每项，因此静态出线取 items；collect 整个对象作为一项。其余 JSON Schema 仍由运行时校验。不是通用 schema 子类型证明。

域内 `tests/multi-input.test.ts` 使用真实文件保存重开，覆盖具名多路 merge、四种 join、Schema、纯表达式解构、空路/失败路、输入顺序/精确参与来源以及节点 preview/retry；浏览器和真实作者验收由本轮 track 汇总。

## 画布路由持久化（2026-09-20）

saveLayout 接收 ViewState 的 positions、可选 viewport、showPorts 与 routing。routing 包含非空 signature 和按连线 ID 索引的 routes；路径至少两个有限坐标点。形状错误在文件修改前拒绝，不覆盖原布局、不通知保存成功。signature 是客户端的展示失效标记，flow 不推导布局或验证它与定义的匹配；客户端只使用匹配当前几何的路由。布局保存不创建定义、不改 draftId 或 comparisons。`tests/canvas-view-state.test.ts` 以真实临时文件验证重开、旧布局兼容和坏输入不覆盖；视觉质量与前端失效判断由画布联测验收。

## 问题认知、步骤合同与展开候选

`semantic.ts` 校验问题字段、合同、动态上限和迭代配置，`checkDefinition` 统一调用；手工可保存未完成草稿，运行与作者保存仍须通过完整校验。`freezeExpansion(workId,expectedDraftId,runId,nodeId)` 只复用已经完成且责任未变化的展开，生成新草稿，不自动采用、不改历史 Run。统一图投影在 shared/expansion.ts，动态提案校验在 flow/expansion.ts。测试：semantic-workflow.test.ts、semantic-author.test.ts。

## 输入契约（2026-09-21）

`contracts.ts`：Definition.inputContracts 按端口声明 item schema（draft-07，复用 schema.ts 编译校验）、required（缺省 true）与 onInvalid（reject 缺省 / interpret）。checkDefinition 统一调用 checkInputContracts（端口须存在、schema 可编译），手工可保存不完整契约，运行前校验不变。validateInvocation 供 invoke 路由逐条校验裸值；机械算子语义不变，契约只管入口。测试 tests/invoke.test.ts。

`FlowNode.tools`仅支持普通Agent，builtin/mcp均为明确数组；校验已知工具/服务名称、重复项和未知字段。字段省略保留旧节点行为，显式空数组表示不提供工具；工具配置随定义冻结。

## 建立子项节点（2026-10-23）

`kind:create-items` 使用 input→output，固定整批处理；无自定义父项配置。输入每项为候选容器，输出每项为该容器的建立回执；inputSchema/expectedOutput按整批数组校验。普通端口规则已覆盖，不加第二套端口逻辑。动态提案明确拒绝create-items；用户必须在保存的方法中显式配置该业务动作。作者TypeBox schema、指引与运行器同步；`tests/create-items-author.test.ts` 验证作者实际保存和动态边界。


Definition.summaryOutput 可选；checkDefinition 验证其精确绑定普通 aggregate 的 output，拒绝动态/迭代摘要节点。输出只按节点 expectedOutput 校验；summaryOutput 不改变执行合法性。shared/result-summary.ts 只提供可选标准摘要的显式schema和展示识别，非标准值仍按普通产物阅读。


## 方法组合与按键分组（2026-10-28）

`calls.ts` 提供 checkCall 与 async validateCallReferences。前者供 checkDefinition 统一校验 call 配置和 map/aggregate 语义；后者递归读取固定方法版本、核对具名输入输出、私有工作归属及循环引用。未保存提案使用不与保存版本冲突的根标识，正式运行仍按新保存ID重验。共同调用/分组配置schema在shared/node-ports.ts，作者工具复用，不另造调度或编译平台。

`functionName:groupBy` 按 groupBy.keys 中的自身字段路径构造类型严格的复合键，输出每组 `{key,items}`；groups与组内项保持首次出现顺序，来源只来自本组输入。它属于普通确定性集合函数；inputSchema约束具名数组对象，expectedOutput约束整个分组数组。join/collect/reduce与现有DAG收口继续复用。验证tests/composition-runtime.test.ts及相邻multi-input/functional-ir。

## 有界运行读取

`snapshot(workId, { overview: true, runIds })` 在 files.select 复制前过滤 Run，并将大值投影为带 contentUrl 的概要；不得把 null 当实际输出。固定正文由 `/api/works/:id/content` 按 run/result/port/index 精确读取，预览每段最多20000字符，完整下载显式请求。概要只用于传输，执行、校验、接续仍从原记录读取。对应反例见 bounded-workspace.test.ts。

浏览器方法工作区的GET、动作响应与SSE显式使用view=overview；需要业务原值的CLI须用view=full并限定runIds，不能把页面概要的遗漏值当结果。InputItem.valueFields保留大值的顶层字段，用于既有交付配置；运行入口拒绝将contentUrl概要作为输入提交。

## 唯一节点语义与编译生命周期

mode和resultOutput已退役，不接受旧字段。普通Agent/Function显式map/flatMap/aggregate，call显式map/aggregate；集合/控制节点固定整批，merge/collect明确inputNames。端口和执行单元来自shared/node-ports，不能在校验器另建旧模式分支。

schema.ts按schema内容复用编译函数，只保留128份近期结果；每次编译后移除Ajv对临时schema对象的强引用。schemaIssue和validateValue共用此机制，候选草案不无限留在全局缓存。files对不可变Definition版本缓存解析，调用方仍拿独立副本。相同定义重复快照不得逐次编译。

验证：runtime-mechanisms.test、functional-ir、multi-input和composition-runtime，覆盖真实输入/输出及失败依赖阻断；领域成果唯一ID由交付合同/具体业务负责，不恢复专用resultOutput引擎。

`Definition.sourceNode` 只记录提取单步骤时的固定来源 `{workId, definitionId, nodeId}`。保存校验三个非空标识；它不加载来源定义、不跟随最新版本，也不形成执行依赖。
