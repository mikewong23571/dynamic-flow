# 少量共享记录

适用本目录。records.ts 已定义正式应用共用的 Definition、Work、Run、NodeResult、Comparison、Snapshot 和模型设置记录。

## 职责与目标

让前后端和功能文件对定义、运行、输入来源、结果、比较与事件身份有一致理解。以 [记录伪代码](../../spike/src/shared/records.pseudo.md) 为起点，在真实调用中只提取确需共享的类型。

## 非目标

不建领域基类、通用 Result/Entity 平台、schema 注册器、验证框架或公共工具杂物目录。单模块内部类型先留在本模块。

## 依赖与交接

仅 TypeScript 类型能力，无运行时依赖，不 import client/server。业务字段由使用该字段的模块共同确认，shared 不独自定义业务规则。

## 已验证交接

下文编号只是查阅索引：P 表示具体测试场景，T 表示完整用户验收路线；含义见 [术语与编号](../../docs/glossary.md)。

- [x] 版本、冻结输入与比较有效性的实际读写一致（场景 P07/P14/P16）。
- [x] 结果来源能跨运行保存与恢复，不只存可变材料引用（场景 P19/P21）。
- [x] 事件身份定位实例，快照含实际定义，不串不同版本（场景 P30/P31）。
- [x] 与实际调用方一同验证；类型通过只证明表达相容，不证明数据含义正确。

## 假设与未知

Node/端口、逐项/汇总来源和活动字段在真实执行、比较、HTTP/SSE 与文件恢复中联测，后续仍可按反例调整。不要把所有伪代码字段一次性变成刚性接口，也不要用 any 掩盖真实调用中的歧义；保留反例并同步相邻模块修订。

首次节点联测先使用记录伪代码中的“材料 → 分类值 → 报告输入”具体例子，对齐模型业务输出、应用校验和来源包装；不要让调用方猜测 expectedOutput 或 InputItem.value。

具体约定：InputItem 保存 sampleId、value、materialIds 和 sourceResultIds；NodeResult 绑定运行、版本、节点及实例；nodeTotals 是已知批次数。工作标题/归档与 ModelSettings/ModelConfiguration 支持 G1/G2；对外配置只返回 apiKeyConfigured，不返回 apiKey。测试见 tests/ 下模块及 integration。

产品级验证与边界见 [本轮验收证据](../../conductor/tracks/full-application_20260920/evidence.md)。

## 持续工作项记录

Work 保留方法与样本；WorkItem 是独立业务编号、目标、材料、完成条件和业务历史。ItemRunRef 同时带 workId/runId/definitionId，支持换方法保留历史。Run.workItem 为冻结输入，不跟随工作项后续补证据。RunWait/RunSignal 描述等待与去重消息；effectMode=preview 不提交业务里程碑。运行完成与 WorkItem.completed 分离；完成条件依据与结项时快照存入 ItemHistory.criteria，重开清除 met 但保留旧依据。具体字段与接口见 [生命周期交接](../../conductor/tracks/workitem-lifecycle_20260920/handoff.md)。

## 纯表达式记录

expressions.ts 仅定义 Expression / Pattern / PureFunction 可序列化联合类型；通过 FlowNode.expression 引用，不能携带函数、闭包或运行时实例。结构化编辑、作者工具、flow校验、runs求值共同遵循 [纯函数语义](../../docs/functional-ir.md)。WorkSummary 的 definitionState/nodeCount 为当页真实定义的派生摘要，不是独立可写状态。
