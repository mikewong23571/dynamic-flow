# Pi 会话、模型端点与业务工具

适用本目录，继承上层约定。已实现 Pi 会话、作者工具与节点执行；域内与真实模型证据见 [probe-results.md](./probe-results.md)，完整用户路线和浏览器通知仍由应用集成验收。

## 职责与子问题

Pi 如何根据当前工作生成/修改真实流程，并完成 Agent 节点任务？负责配置、作者/节点会话、应用工具、流式事件、取消与结果检查。故事：A2、B3、C2、E1。

## 目标

- 复用 Pi 模型调用与工具循环；只补应用上下文、工具和事件关联。
- update_flow 实际保存才算修改；固定发送时节点、样本与定义版本。
- 三种协议分别验证自定义端点、流式、工具、错误与取消；配置失败不回退假模型。

## 非目标

不调度整张图，不直接修改 React Flow，不自建 ProviderFactory/Agent 框架，不把业务分类写死，不自动采用候选。

## 接口与依赖

提供 requestEdit/stopEdit、executeNode、configuration/saveConfiguration；后者带运行/定义/节点/实例身份、停止信号及活动回调。update_flow、inspect_result 是应用工具，不是 Pi 自带功能。

直接依赖 flow、files，外部依赖 @earendil-works/pi-coding-agent、@earendil-works/pi-ai。inspect_result 直接读 files，不依赖 work/runs，避免循环。根 .env.local 由后端读取。参考 [伪代码](../../../spike/src/server/assistant.pseudo.md) 与 [链路说明](../../../spike/pi-canvas-dependencies.md)。核对安装版本 SDK，不照抄伪代码为假 API。

## 验收与证据

下文编号只是查阅索引：P 表示具体测试场景，T 表示完整用户验收路线；含义见 [术语与编号](../../../docs/glossary.md)。

- [x] 实际生成/修改定义，固定目标，过期提案不覆盖；没有工具保存就不声称完成（场景 P02/P12/P13/P26）。
- [x] 逐协议真实验证文本、工具、错误和取消；记录端点/模型及限制，不记录密钥（场景 P24/P08）。
- [x] Pi 工具保存后、最后文字回复前，画布已经更新；联测到前端（场景 P29）。
- [x] 同名 toolCallId 不串会话/实例；输出缺必需字段如实失败（场景 P30）。

## 假设与未知

旧实验仅 Pi + faux provider。所列端点的协议兼容、工具输出和取消已真实验证；其它端点/模型仍需按相同方法验证；不存在“装包成功即完成”的证据。发现不兼容先保留最小真实失败，再调整调用方式，不能硬编码成功。本清单不穷尽未知。

## 实现交接与已发现反例

- `createAssistant(files, flow, options)` 导出 `requestEdit/stopEdit/executeNode/configuration/saveConfiguration`。模型业务错误保留在消息/节点结果；绝不回退 fixture。`openai-chat-completions` 是用户协议名，映射 SDK `openai-completions`。
- 作者请求复制发送时节点/样本/版本；工具修改保存后广播 files 通知，自己的后续保存使用新版本，外部并发修改导致拒绝并保留提案。目标节点之外的结构变化需要全流程请求。
- 真实端点拒绝最初 TypeBox Tuple/Record schema（HTTP 400/1210）；改用等价定长数组/additionalProperties 后真实作者通过。Definition 的后端结构校验没有放宽。首次作者遗漏 schemaVersion，Pi 工具错误反馈后真实修正；精确过程与限制见证据。
- 作者工具未保存或仅原样保存均不计为实际变更。输出复用 flow/schema.ts 的 Ajv draft-07 校验，并做明确材料编号及逐字引文的机械核查，不把此项宣称为完整语义事实审查。
- 浏览器反例表明作者的临时无效定义会污染首份比较基线：作者 update_flow 必须在 saveDraft 前 validateForRun；手工 flow.saveDraft 仍允许不完整编辑。嵌套 evidence 字符串与 quote 都必须核对继承的材料编号及原文，不能借用其它样本的真实引文。
- G1 设置接口：createAssistant options.settingsPath 指定服务器配置文件；configuration 返回非密钥配置与协议限制，saveConfiguration 原子保存且空 apiKey 沿用已有。没有已保存设置时 .env 回退，禁止修改用户 .env。请求内固定配置。Anthropic 预算语义与 Chat effort 必须区分，不能把保存成功当成任何模型都支持全部参数。
- G2 作者工具可选 title 只在最新 work.titleEdited 不为 true 时写入，不覆盖手工命名。

产品级验证与边界见 [本轮验收证据](../../../conductor/tracks/full-application_20260920/evidence.md)。

## 持续工作项交接

NodeExecution.workItem 提供固定业务编号、目标与 data；materials 使用同一运行冻结的工作项材料，禁止混入方法样本。operation 优先于旧 mode。作者工具可生成 wait/milestone 和输入输出 schema；schema 使用统一 Ajv 校验，未知关键字明确拒绝。作者不直接结项，模型输出不自动等于业务事实。

验证：tests/assistant.test.ts 覆盖工作项目标/材料进入 Pi 边界及共享 union/const schema；真实模型生命周期与证据见 [持续工作项验收](../../../conductor/tracks/workitem-lifecycle_20260920/evidence.md)。

## 纯函数作者交接

update_flow 接受 functionName=expression 与纯表达式树；根传输 schema 要求支持的 kind，完整递归形状、变量作用域和模式约束由 flow.checkDefinition 在保存前验证，避免兼容端点因递归 $ref schema 拒绝工具。expression-guide.ts 描述精确字段和实例，不新增模型/工具循环。坏表达式不会进入已保存草稿，修正后通过原有版本冲突机制保存。

本轮 tests/functional-author.test.ts 为 Pi 边界替身，实际模型记录另见 functional-ir-management track 的 artifacts/live-author.json；不可互换两类证据。
