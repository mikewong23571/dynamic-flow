# 少量共享记录

## 快速定位

| 文件 | 内容 | 主要消费者 |
| --- | --- | --- |
| `records.ts` | Work/WorkItem/Run/Definition/InputItem/NodeResult/Snapshot、模型配置与 ViewState | client 与 server 各业务模块 |
| `expressions.ts` | 可序列化 Expression/Pattern/PureFunction 联合类型 | Inspector、作者工具、flow 检查与求值 |
| `node-ports.ts` | nodeInputPorts/collectionFunction/expandedCollectionOutput 纯语义函数 | canvas/inspector、flow、runs |

改字段时同时核对生产、消费与旧文件重开；单模块内部类型留在模块内。验证按字段所属域从 [测试地图](../../tests/AGENTS.md) 选择，不另造一套只有类型能通过的 shared 测试。下文是关键合同，历史验收记录不代表本次运行结论。

适用本目录。records.ts 已定义正式应用共用的 Definition、Work、Run、NodeResult、Comparison、Snapshot 和模型设置记录。

## 职责与目标

让前后端和功能文件对定义、运行、输入来源、结果、比较与事件身份有一致理解。以当前 records.ts、实际调用双方和保存文件为准，只提取确需共享的类型；历史伪代码不作为当前字段合同。

## 非目标

不建领域基类、通用 Result/Entity 平台、schema 注册器、验证框架或公共工具杂物目录。单模块内部类型先留在本模块。

## 依赖与交接

TypeScript 类型与少量跨调用方共享的纯语义函数，无外部运行时依赖，不 import client/server。业务字段由使用该字段的模块共同确认，shared 不独自定义业务规则。

## 已验证交接

下文编号只是查阅索引：P 表示具体测试场景，T 表示完整用户验收路线；含义见 [术语与编号](../../docs/glossary.md)。

- [x] 版本、冻结输入与比较有效性的实际读写一致（场景 P07/P14/P16）。
- [x] 结果来源能跨运行保存与恢复，不只存可变材料引用（场景 P19/P21）。
- [x] 事件身份定位实例，快照含实际定义，不串不同版本（场景 P30/P31）。
- [x] 与实际调用方一同验证；类型通过只证明表达相容，不证明数据含义正确。

## 假设与未知

Node/端口、逐项/汇总来源和活动字段在真实执行、比较、HTTP/SSE 与文件恢复中联测，后续仍可按反例调整。不要把所有伪代码字段一次性变成刚性接口，也不要用 any 掩盖真实调用中的歧义；保留反例并同步相邻模块修订。

节点联测使用“材料 → 分类值 → 报告输入”的具体例子，对齐模型业务输出、应用校验和来源包装；不要让调用方猜测 expectedOutput 或 InputItem.value。

具体约定：InputItem 保存 sampleId、value、materialIds 和 sourceResultIds；NodeResult 绑定运行、版本、节点及实例；nodeTotals 是已知批次数。工作标题/归档与 ModelSettings/ModelConfiguration 支持 G1/G2；对外配置只返回 apiKeyConfigured，不返回 apiKey。测试见 tests/ 下模块及 integration。

## 模型目录与选择记录

ModelSelection（alias + 可选 effort）是目录选择的最小记录：全局默认存 ModelSettings.defaultSelection（同一份设置文件，允许"只有选择、尚无手动配置"的文件）；Work.modelSelections.assistant 是本工作对话覆盖，结构留 scope 位（workflow 预留未用）。ModelCatalogEntry/ModelCatalogProvider 是目录公开形状，只有 apiKeyConfigured/headersConfigured，不含密钥与请求头内容。EffectiveModel（source: work/default/manual/env + alias/model/effort）随 ChatMessage 与 NodeResult 可选保存，披露本次实际生效模型；旧数据无这些字段正常读取。NodeExecution.effectiveModel 由 executeNode 在请求开始固定后写入，runs 存进 NodeResult。

产品级验证与边界见 [本轮验收证据](../../conductor/tracks/full-application_20260920/evidence.md)。

## 持续工作项记录

Work 保留方法与样本；WorkItem 是独立业务编号、目标、材料、完成条件和业务历史。ItemRunRef 同时带 workId/runId/definitionId，支持换方法保留历史。Run.workItem 为冻结输入，不跟随工作项后续补证据。RunWait/RunSignal 描述等待与去重消息；effectMode=preview 不提交业务里程碑。运行完成与 WorkItem.completed 分离；完成条件依据与结项时快照存入 ItemHistory.criteria，重开清除 met 但保留旧依据。具体字段与接口见 [生命周期交接](../../conductor/tracks/workitem-lifecycle_20260920/handoff.md)。

## 纯表达式记录

expressions.ts 仅定义 Expression / Pattern / PureFunction 可序列化联合类型；通过 FlowNode.expression 引用，不能携带函数、闭包或运行时实例。结构化编辑、作者工具、flow校验、runs求值共同遵循 [纯函数语义](../../docs/functional-ir.md)。WorkSummary 的 definitionState/nodeCount 为当页真实定义的派生摘要，不是独立可写状态。

## 来源节点

FlowNode.kind 增加 `file`：参数 `file.name` 指向工作 uploads 文件，无入边、输出 `output`（值为文件名，供下游 agent 节点用 Node 运行时读取），runs 不调模型直接产出；有 file 来源节点的定义允许 `inputs` 为空。材料与 `$input` 语义不变：钉死的数据走来源节点，按批换的数据走批次输入。

## 集合端口

node-ports.ts 集中 nodeInputPorts、collectionFunction、expandedCollectionOutput，避免客户端/校验/执行分别维护端口名单。FlowNode.inputNames 表达新 merge/collect 的有序端口，join 定义模式、两侧键路径与重复策略；旧无 inputNames merge 保持兼容。共享纯函数不代替 flow 的外部输入形状校验。具体例子及错误见 [多路组合](../../docs/multi-input.md)。

## 画布展示状态

ViewState.positions / viewport 保存节点位置与视口；可选 showPorts 保存端口显示偏好，可选 routing 保存 `{signature, routes}`。routes 以 `edge-${index}` 标识连线，每条路径为至少两个绝对坐标点。signature 由客户端按图结构、实际几何与节点位置生成，只用于检测路由是否过期；路由与偏好都不是 IR，也不影响输入端口顺序、定义版本或比较有效性。旧数据缺少可选字段仍可读取和保存，后端在 saveLayout 校验路由形状后保存。

## 问题驱动的动态工作流

`Definition.problem` 保存当前 framing/known/unknown/constraints/evidence 文本，随定义版本冻结；`FlowNode.contract` 描述 responsibility/done/rationale/semanticRole，不把文本完成条件当机器证明。`repeat` 是 map 步骤的有限迭代配置，`dynamic` 是有限局部子图规划。`Run.expansions` 保存实际子图；`NodeResult.purpose/iteration/intermediate/repeatDone` 区分规划、逐轮和最终结果。`expansion.ts` 仅将已记录展开投影成同一执行图，原 Definition 不变。具体边界见 [本轮合同](../../docs/semantic-workflow.md)。
