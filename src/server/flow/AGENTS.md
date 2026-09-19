# 流程草稿、校验与采用

适用本目录，继承上层约定。当前已实现本模块业务；域内证据与产品联测边界见文末实现交接。

## 职责与子问题

人的画布操作与 Agent 修改，如何成为同一份可执行、可比较的做法？负责草稿保存、节点/参数/连接变化、配置问题、布局另存和采用/放弃。故事：B1–B4、E1、E4、F1。

## 目标

- 手工与 update_flow 使用同一保存入口；旧请求不能覆盖新修改。
- 语义修改产生新定义，布局修改不改变版本或比较有效性。
- 不完整草稿可保存，不能冒充可运行；采用不改写历史结果。

## 非目标

不分析任意 JS、反编译画布，不做表达式编译器、通用 patch DSL 或自动冲突合并，不执行模型。

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

当前端口：普通节点 input/output；branch input → matched/unmatched、mode=all；merge left/right → output、mode=all。每个目标端口仅一条来源。条件 field 为空字符串表示判断整个 value，非空字段由 runtime 读取；这是文本材料直接分流的具体需要，影响 B2/T2，已与 runs 实现者同步并加入域内有效定义测试。旧伪代码 match/rest 不再是实际接口。

域内证据：`pnpm exec tsx --test tests/state.test.ts` 验证冲突、起点、保存不完整配置、局部问题、环、显式汇合和布局不改版本。状态为 **模块实现完成，产品联测待验收**；连线实际输入、Pi 改图和浏览器操作交由相邻模块与根验收。

产品级验证与边界见 [本轮验收证据](../../../conductor/tracks/full-application_20260920/evidence.md)。
