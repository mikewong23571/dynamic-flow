> 当前合同沿用；下文首轮agent分工及并行顺序为历史组织记录。本轮由主代理独立执行，不派发子代理。

# 模块交接合同

状态：保留既有实现的技术合同，主代理独立维护；不再按子代理派发推进。本轮只修订track，字段实现和检查结果不代表前端设计已经通过。

## 不变的职责

- 现有 Definition 表达方法与工作项胶水；现有 Run 执行，调用关系显式记录。
- 单个工作项持有当前私有流程和交付绑定，原始成果只保存在真实运行中。
- 方法目录提供用途、保存版本、输入输出/基数及效果；来源不足时不猜测。
- 有限视图声明描述组件、字段和动作，不携带模型编造的业务结果。
- UI、Assistant 共用工作项保存/执行服务；业务写入有修订检查。

## 首轮合同形成经过（历史）

runtime agent 在本节写入组合调用节点、端口与 schema、当前需要的原语，以及返回输出/子 Run 的合同。

backend agent 写入工作项快照、私有流程/会话、动作及交付响应形状；frontend 只依赖已冻结类型。

允许复用既有 Work 存储私有流程，但需要明确私有归属和目录可见性，避免其他工作项默认读到其材料。提取为可复用方法时参数化本次绑定。

## 首轮交接顺序（历史）

1. runtime 先冻结共享类型；backend/frontend 可以并行阅读及构图。
2. backend 定义前端 API 后发消息通知，新增接口写相应测试。
3. frontend 接入真实 API，错误回报交给责任模块修复，不增加客户端猜测或假状态。

## Runtime/shared 首轮冻结（2026-10-28）

正式源码只在独立工作区修改。shared 类型已在该工作区 records.ts 与 workitem-composition.ts 提供。

- 调用节点：`{kind:'call',mode:'all'|'each',operation:'aggregate'|'map',call:{workId,definitionId,inputNames:string[],outputNames:string[],eachPort?:string}}`。inputNames/outputNames 必须与固定被调用 Definition.inputs / outputs 名称一致；采用版本不在运行中跟随更新。aggregate 整批具名输入调用一次；map 按 eachPort 每条调用一次，该端口只带当前条，其余端口广播；map 必须声明有效 eachPort。不用 call.flatMap；展开返回集合使用既有函数 flatMap。
- 调用端口：`nodeInputPorts(call)=call.inputNames`，输出为 `call.outputNames`。每个被调用定义的具名 outputs 映射为父调用同名端口的实际条目列表，不把多路输出压成 output 或任意对象。inputSchema/expectedOutput（若声明）分别检查具名值数组对象。
- `NodeResult.call?:{workId,runId,definitionId}` 固定真实子 Run，先保存关联再派发。`Run.parentCall?:{workId,runId,definitionId,nodeId,instanceId,resultId}` 记录直接父调用；子调用用同一 schedule/perform 执行机制，内部身份不占用新的独立工作项会话，不递归调用公共 start，不建第二调度器。effectMode/comparison 与业务上下文显式继承；停止传播调用树。子 Run 等待时父调用/根运行显示 waiting；事件与恢复复用原子 Run 及成功实例。
- 定义读取/调用接口/递归调用在启动前检查；不得通过保存一份无效定义绕过。运行时动态提案同样需要检查调用引用。
- `functionName:'groupBy',groupBy:{keys:(string|number)[][]},mode:'all',operation:'aggregate'` 使用 input 端口，每条输入按多个自身字段路径分组；键须为 string/finite number/boolean，类型严格区分，缺失/null/对象/数组失败。输出 output 为分组条目 `{key:Json[],items:Json[]}`，按键首次出现、组内输入顺序排列，来源仅来自本组实际输入。inputSchema 约束 `{input:值数组}`，expectedOutput 约束完整分组数组。
- map/flatMap、collect、join、顺序 reduce 与 DAG 就绪收口直接复用；不为术语新增 barrier 调度器。本轮失败仍保留成功实例并阻断要求成功的下游，不能冒充已支持任意部分失败交付。
- `Work.ownerItemId?:string`、`WorkItem.compositionWorkId?:string`、`WorkItem.compositionInputs?:Record<string,ItemInputSelection[]>`；私有工作不作为公共方法默认列出，backend负责执行。
- `ItemPresentation={kind:'table'|'report',output,title?,rowKey?,columns?:{field,label}[]}`；`ItemDelivery={id,createdAt,workId,runId,definitionId,presentation}`；`WorkItem.delivery?:ItemDelivery`。
- `ItemWorkspace={item,work?:Snapshot,methods:MethodCapability[],uploads:string[],delivery?:ItemDelivery & {rows?:Json[],value?:Json,sources:OutputReference[],error?:string}}`，位于 shared/workitem-composition.ts。backend返回真实绑定，frontend通过有限registry适配，不另建业务值副本。

共享补充：Work.presentation/Work.presentations 与 MethodCapability.presentation/presentations 保存有限方法视图模板；WorkItem.deliveries 与 ItemWorkspace.deliveries 保存当前多输出交付列表，delivery为当前选中。MethodCapability可选outputContracts/effects/definition/adopted供目录读取具体合同。

调用来源补充：InputItem.source?:OutputReference 在call输出边界指向实际被调用Run的生产结果/端口/索引；sourceResultIds仅指当前父工作内的调用结果，避免将跨工作子结果ID当成本地ID解析。NodeResult.call给出整体调用身份，两者共同支持精确检查。普通节点已有来源规则保持。

运行交接补充：Run.materials 固定普通嵌套方法的材料范围；有workItem时同步过滤其materials。仅选择当前调用batch中materialIds（含显式广播facts），不继承其他map输入材料或callee样例，缺失引用失败。RunWait.source?:ItemRunRef&{nodeId}投影真实子等待；父signal转发到实际等待执行，父resume沿调用树继续原Run。业务独立子项不在此树中。共享callConfigSchema/groupByConfigSchema导出于node-ports.ts；flow校验与作者schema共同消费。

## 当前设计修订的交接约束

应用首页/全局导航/共用工作区骨架属于client职责，默认落点以当前spec为准。新建首页优先复用既有工作项查询和创建服务，未有具体反例不增加新的应用层服务或运行器。Assistant编排、输入、交付和生命周期仍调用原正式服务。

信息架构与业务接口分别核对：隐藏常驻工具不删除必要能力；保留接口不要求默认显示每个动作。子项、调用实例与结果记录不混同，记录合并展示仍使用固定跨方法来源。具体可见设计先于组件接口定案，不能先造布局API再让页面迁就它。

## 当前业务界面合同（2026-10-29，替代首轮展示子集）

ItemPresentation增加groups/groupBy/details/actions；字段仍为顶层，记录ID为非空唯一字符串。WorkItem.uiPlan={id,definitionId,views,inputs}随本项修订原子保存；Work.uiPlan是公用方法模板。ItemDelivery.uiPlanId及完整presentation固定一次真实绑定。

checkUiPlan/saveUiPlan共用实际输出、方法与字段合同；publishUiPlan一次验证同Run所有视图，通过才替换相应输出绑定。uiAction只接deliveryId/actionId/recordIds/draft和baseRevision，重读真实声明/选中值后调用continueRecords；输入字段白名单和inputContract再检查，execute=true委托原run。submitInputTask调用原addInput追加修订。review只进入原criteria/complete任务，不改条件。

/data只读，/draft与/selection可写；共享actionProblem及服务端actionBlockers同时决定禁用原因与命令拒绝。旧方案/定义、输入修订与运行中不能被旧核对动作跳过。Renderer有限六组件，无任意spec/HTML/HTTP脚本。界面不是工作项第二执行引擎；复杂业务放公用流水线。

## 当前访问合同

2026-10-29：[docs访问合同](../../../docs/task-navigation-contract.md)为权威，模块交接见[本轮记录](task-navigation-contract.md)；新导航track接续实施。旧父入口规则待替换，既有运行/声明业务语义保留。
