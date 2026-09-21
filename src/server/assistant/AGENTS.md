# Pi 会话、模型端点与业务工具

## 快速定位

| 文件 | 职责 / 调试入口 |
| --- | --- |
| `index.ts` | createAssistant、requestEdit/stopEdit、update_flow/inspect_result 工具、executeNode 的上下文与输出处理 |
| `pi.ts` | runPiSession：Pi SDK 适配、会话、取消、工具活动、文件/运行库链接及 cleaned- 制品收集 |
| `config.ts` / `settings.ts` | 协议配置类型、安全错误文本 / 参数与协议映射、目录选择、公开配置与默认选择保存 |
| `catalog.ts` | models.toml 解析/校验/保存，公开目录脱敏；目录是模型配置唯一来源 |
| `validation.ts` | 模型输出解析和材料引用/引文机械检查；不是完整事实审查 |
| `expression-guide.ts` / `collection-guide.ts` | 作者工具看到的表达式/集合合同，须与 flow 校验、runs 执行同步 |
| `profile-flow.ts` | 内建文件剖析 Definition 的构造、文件实例化及输出读取；实际启动/收尾在 server/index.ts |
| `probe.ts` / `author-probe.ts` | 真实端点探针；历史结果在 probe-results.md，参数说明在 model-parameter-notes.md |

主要测试：`tests/assistant.test.ts`、`tests/functional-author.test.ts`、`tests/multi-input-author.test.ts`、`tests/profile-import.test.ts`。这些替身/接线结果不代替真实端点验证；运行探针前核对其配置与输出，密钥不得进入证据。

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

- `createAssistant(files, flow, options)` 导出 `requestEdit/stopEdit/executeNode/configuration/saveDefaultSelection/saveWorkSelection/saveCatalog/testCatalogEntry`。模型业务错误保留在消息/节点结果；绝不回退 fixture。`openai-chat-completions` 是用户协议名，映射 SDK `openai-completions`。
- 作者请求复制发送时节点/样本/版本；工具修改保存后广播 files 通知，自己的后续保存使用新版本，外部并发修改导致拒绝并保留提案。目标节点之外的结构变化需要全流程请求。
- 真实端点拒绝最初 TypeBox Tuple/Record schema（HTTP 400/1210）；改用等价定长数组/additionalProperties 后真实作者通过。Definition 的后端结构校验没有放宽。首次作者遗漏 schemaVersion，Pi 工具错误反馈后真实修正；精确过程与限制见证据。
- 作者工具未保存或仅原样保存均不计为实际变更。输出复用 flow/schema.ts 的 Ajv draft-07 校验，并做明确材料编号及逐字引文的机械核查，不把此项宣称为完整语义事实审查。
- 浏览器反例表明作者的临时无效定义会污染首份比较基线：作者 update_flow 必须在 saveDraft 前 validateForRun；手工 flow.saveDraft 仍允许不完整编辑。嵌套 evidence 字符串与 quote 都必须核对继承的材料编号及原文，不能借用其它样本的真实引文。
- G1 设置接口（2026-09-20 起目录为唯一来源）：createAssistant options.settingsPath 保存全局默认选择；configuration 返回非密钥目录与选择状态。手动配置与 .env 回退已按用户决定移除（原型不需要兼容性），请求内固定配置。Anthropic 预算语义与 Chat effort 必须区分，不能把保存成功当成任何模型都支持全部参数。
- 模型目录（2026-09-20）：options.catalogPath 指向仓库根 models.toml（kimi-code schema：[providers.*] type/base_url/api_key/custom_headers + [models."provider/别名"] provider/model/max_context_size/support_efforts/default_effort；type anthropic/openai/openai-responses 映射三种协议，其它类型加载即报中文错误）。catalog.ts 负责解析/校验/原子重写（0600，空 apiKey 沿用旧值）；公开条目只有 apiKeyConfigured，密钥与请求头不出 API。思考级别词表 off/minimal/low/medium/high/xhigh/max（与 pi thinkingLevel 对齐）；support_efforts 显式空数组 = 不设置思考级别（解析为 off），省略字段 = 默认四档 low/medium/high/max；default_effort 可省略（取回退档）。解析链：assistant 的 Work 覆盖（Work.modelSelections.assistant）→ 全局默认（设置文件 defaultSelection）→ 未配置报错；目录别名失效时如实回退下一级并在 effectiveModel.source 与 requested 可见，不静默假装仍是所选模型。custom_headers 经 ModelConfig.headers 透传 pi-ai registerProvider。testCatalogEntry 跑一次最小真实会话（echo 工具回显，90s 超时），错误经 safeError 脱敏，不回退假模型。保存目录时被默认选择或任一 Work 覆盖引用的别名不得删除（服务端扫 works 拒绝）。
- G2 作者工具可选 title 只在最新 work.titleEdited 不为 true 时写入，不覆盖手工命名。
- 材料导入 = 内置**数据剖析 workflow**（profile-flow.ts）：file 来源节点引用上传文件 → probe 识别格式与规模 → branch 按 scale 分流 → 小文件直接拆分登记、大文件剖析并把 schema 化洞见写入 cleaned-insight.json（六字段：overview/structure/stats/qualityIssues/artifacts/suggestions，structure/stats 可为嵌套对象）。server 入口 importMaterials 负责 seed、runs.start 与 onFinish 收尾：canonicalProfileDefinition 优先读取已存在内建流水线的采用版本，否则使用 buildProfileDefinition 初值；seed 与按文件名实例化（withProfileFile）后的规范全等才复用，不占调用方 draft/adopted。小文件登记拆分条目，大文件以 cleaned-insight.json 为准校验登记一条洞见材料。executeNode 的 agent 节点会话带 Pi 内置 read/grep/find/ls/bash、linkRuntime（node_modules 软链，预装 xlsx/mammoth/unpdf，新增库须同步节点提示词）、uploads 全量 linkFiles 与 cleaned- 制品 collect 收割；节点最终回复保持简短，结构化产物落文件，避免长 JSON 回复格式事故。披露给模型的材料/结果列表用 clipList 裁剪并附截断标记。模型调用级 retry 已开启（网关长会话断流续跑，工具调用不重放）。

产品级验证与边界见 [本轮验收证据](../../../conductor/tracks/full-application_20260920/evidence.md)。

## 持续工作项交接

NodeExecution.workItem 提供固定业务编号、目标与 data；materials 使用同一运行冻结的工作项材料，禁止混入方法样本。operation 优先于旧 mode。作者工具可生成 wait/milestone 和输入输出 schema；schema 使用统一 Ajv 校验，未知关键字明确拒绝。作者不直接结项，模型输出不自动等于业务事实。

验证：tests/assistant.test.ts 覆盖工作项目标/材料进入 Pi 边界及共享 union/const schema；真实模型生命周期与证据见 [持续工作项验收](../../../conductor/tracks/workitem-lifecycle_20260920/evidence.md)。

## 纯函数作者交接

update_flow 接受 functionName=expression 与纯表达式树；根传输 schema 要求支持的 kind，完整递归形状、变量作用域和模式约束由 flow.checkDefinition 在保存前验证，避免兼容端点因递归 $ref schema 拒绝工具。expression-guide.ts 描述精确字段和实例，不新增模型/工具循环。坏表达式不会进入已保存草稿，修正后通过原有版本冲突机制保存。

本轮 tests/functional-author.test.ts 为 Pi 边界替身，实际模型记录另见 functional-ir-management track 的 artifacts/live-author.json；不可互换两类证据。

## 多路组合作者合同

update_flow 接受 inputNames 与 join 配置，collection-guide.ts 提供具名数组输入、固定分发、四种关联、重复/缺键的明确规则。工具传输 schema 与 flow 语义检查共同生效，错误提案不写草稿；测试见 tests/multi-input-author.test.ts，真实模型证据见 multi-input_20260920 track。不要把普通 aggregate 扁平数组规则套到新集合函数上。

## 问题驱动作者与局部规划

`semantic-guide.ts` 定义最小有用 Plan、问题/方案分离、责任合同、Each 语义角色和局部动态边界。`update_step` 替换一个完整节点并委托同一 update_flow 校验/版本检查；`inspect_run` 返回固定输入、问题、展开和逐轮结果；`freeze_expansion` 复用 flow.freezeExpansion，只写候选。现有 inspect_result 仍用于精确读取。

executeNode 接收固定 problem/contract/iteration。dynamic 会话必须通过 submit_workflow 提交 Definition，无内置执行工具；作者工具和 runtime 都复用 flow/expansion.ts 校验，不再解析最终聊天文本作为计划；节点 expectedOutput 约束展开的实际产物，不约束计划 JSON。其它 Agent 保留工具选择自由、材料和引用检查。真实模型与替身验证分列在 semantic-workflow track。
