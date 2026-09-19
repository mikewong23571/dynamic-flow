# Pi / Assistant 实测证据

日期：2026-09-20。SDK：`@earendil-works/pi-coding-agent` / `pi-ai` 0.85.1。所有下表模型调用均使用真实 `ModelRuntime` + `createAgentSession` 与用户本地配置中的凭据；没有 faux provider、fixture 回退、配置文件修改或密钥记录。模型：`glm-5.3-flash`。

## 自定义端点与真实 SDK 工具循环

`probe.ts` 通过工具读取现场值，再由模型在下一轮返回该值；判定包含工具实际执行、文本流到达与最终值匹配。每次工具都有开始/完成活动。取消在调用开始 1 秒后发出；故障测试使用刻意不存在的模型。

| 用户协议 / SDK 协议 | 精确端点 | 文本流 + 工具 + 最终回复 | 真实取消 | 真实服务端错误 |
| --- | --- | --- | --- | --- |
| Anthropic Messages / `anthropic-messages` | `https://open.bigmodel.cn/api/anthropic` | 10,671 ms；1 工具调用，7 文本块，2 活动；通过 | 1,008 ms，AbortError；通过 | HTTP 400 / 1211 模型不存在；如实失败 |
| OpenAI Chat Completions / `openai-completions` | `https://open.bigmodel.cn/api/paas/v4` | 10,150 ms；1 工具调用，7 文本块，2 活动；通过 | 1,008 ms，AbortError；通过 | HTTP 400 / 1211 模型不存在；如实失败 |
| OpenAI Chat Completions / `openai-completions` | `https://open.bigmodel.cn/api/coding/paas/v4` | 8,695 ms；1 工具调用，4 文本块，2 活动；通过 | 1,017 ms，AbortError；通过 | HTTP 400 / 1211 模型不存在；如实失败 |
| OpenAI Responses / `openai-responses` | `https://open.bigmodel.cn/api/v1` | 9,396 ms；1 工具调用，7 文本块，2 活动；通过 | 1,004 ms，AbortError；通过 | model_not_found；如实失败 |

配置接受产品名称 `openai-chat-completions` 并映射为 SDK 的 `openai-completions`；后者保留为兼容别名。仅脚本本轮内用 `PROBE_BASE_URL` 指定其它协议对应路径，不自动改写用户端点。表内成功只代表所列模型/路径/测试输入，不宣称任意提供商兼容。

## 作者生成与实际节点

`author-probe.ts` 创建真实临时 Work、调用作者工具保存不可变定义、运行 flow 检查，并经同一 executeNode 路径调用真实模型。

发现的具体摩擦：

1. 最初 `update_flow` 参数使用 TypeBox Tuple 和 Record，分别编码为 `items:[]` 与 `patternProperties`；此完整 schema 被当前 Anthropic 兼容端点拒绝，HTTP 400 / 1210 参数错误。把端口元组改成 minItems/maxItems=2 的普通数组，把 outputs 改成 additionalProperties 后，真实请求能进入模型和工具执行。两者一并修改，因此尚未分别隔离确认是哪一个关键字触发拒绝。后端 Definition/flow 类型和校验未放宽。
2. 模型首次生成很大的报告 JSON schema，并漏掉 `schemaVersion`。90 秒预算未完成；延长观察后看到真实工具 schema 错误，Pi 自动向模型返回错误，下一次 update_flow 修复并保存成功。不是固定流程回退。
3. 已在作者提示中明确必须填写 schemaVersion、使用必要的最小字段，以及面向用户的最终报告使用 Markdown 字符串，避免为报告生成庞大的嵌套 JSON schema。额外流诊断只统计事件类型和字符数，不输出思考内容。

已观察到的真实结果：作者成功保存两个 Agent 节点（逐条分类、整体汇总）；`validateForRun` 通过，定义无运行问题。真实分类节点把混合反馈识别为称赞及问题，并返回两条来源一致、可在原文中找到的引文：“界面很顺手”与“导出报告经常失败，影响交付。”；输出 schema 与证据校验均通过。初始同时多类别是模型本轮真实结果，不预设混合反馈一定错误。

选定分类节点的真实后续修改已通过：请求“同时表达赞扬和问题时，归为问题，并保留两方面原文依据”，实际生成新版本，目标节点定义确实改变，另一个汇总节点保持相同。该结果在同一真实工作中完成，未改为测试替身。

## 域内行为测试

`pnpm exec tsx --test tests/assistant.test.ts`：7/7 通过（真实临时文件与 flow；模型循环按测试注入可控 runner，明确不属于上表真实模型证据）。覆盖配置检查；保存先于最终文字；两次工具保存沿用自己的新版本；发送后目标/样本冻结；并发人工修改不被迟到提案覆盖且提案保留；选中节点不修改其它步骤；文字未实改不算成功；停止抵达调用信号；必需字段/枚举/嵌套数组校验；未知材料编号与编造引文拒绝；节点仅取得本次输入范围内的原始材料。

浏览器到画布通知、完整 T1/T3/T5、其余运行调度与整体验收由根任务继续执行。本模块测试与协议探测不能代替这些证据。

## 浏览器反例后的修正（2026-09-20）

根任务实际浏览器发现作者曾先保存带不存在 `$output` 节点的无效定义，再修成有效定义。这会使初始比较基线引用第一份无效草稿。作者 `update_flow` 现于任何定义写入前执行 `validateForRun`，坏提案只保留在助手消息，并将错误返回 Pi 修正；手工草稿仍允许不完整。已用真实 files/flow 测试确认坏提案不设置 draftId/draftBaseId、不加入 definitionIds；修复后的首份有效定义才成为基线。

作者提示已明确不存在 `$output` 虚拟节点、最终输出仅在 outputs 映射声明；最终回复用两到三句业务说明，不展示内部 ID、源码或冗长技术排错。

另一个真实模型输出采用顶层 materialId 与嵌套 items[].evidence 字符串。依据校验已支持 evidence 字符串/字符串数组，并沿父子对象继承材料编号；即使引文存在于另一条真实材料中，也不能作为当前编号的依据。新增正例和跨材料/编造引文反例。`[M99]` 引用拒绝与真实 fenced JSON 解析均已用直接调用及回归测试核实；原正则并无双反斜线执行错误。

本轮 `pnpm exec tsx --test tests/assistant.test.ts` **10/10** 通过，`pnpm typecheck:app` 通过。该修改后完整浏览器运行仍由根任务继续验证。

## 真实报告 string 失败后的修正（2026-09-20）

根浏览器 T1 中三条分类成功，但报告声明 expectedOutput={type:'string'}，执行提示却一律要求存在 schema 时返回 JSON，导致模型把报告包成对象并触发类型错误。现已为 string 输出专门要求 Markdown 正文，明确不使用 report/content JSON 字段包装。parseOutput 继续接受纯文本或 JSON 字符串解码，但拒绝对象伪装，并提示用户重试本节点或明确正文输出要求。

以该失败报告原有的三条分类输入进行一次真实 executeNode 探测，保留当前 glm-5.3-flash/Anthropic 与原参数：**21,321 ms，636 字符 Markdown，含 [M01]、[M02]、[M03]，string schema 与引用校验通过**。探测没有保存到原 Work，不冒充 UI 重试记录。根任务继续从 UI 只重试失败报告。

同时 user/assistant 消息都保存了发送时 sampleIds 的独立副本，user 的原 definitionId 保持不变，供上下文显示和重试。回归测试新增正文/JSON字符串/对象拒绝、两种输出提示区分和已保存上下文检查。域内 **12/12**，typecheck 通过。

模型推荐参数的只读核查与真实本地 payload 捕获另见 [model-parameter-notes.md](./model-parameter-notes.md)；本轮未改用户协议和模型参数。

## G1 模型设置与 G2 自动标题（2026-09-20）

新增 `createAssistant(...,{settingsPath})` 的 `configuration():ModelConfiguration` 与 `saveConfiguration(settings):Promise<ModelConfiguration>`。配置保存在根传入的服务器路径，临时文件写入后 rename；未保存时读取原 .env 配置。空 API Key 沿用现有密钥，任何返回对象均不包含密钥。保存仅影响后续模型调用，已启动作者请求保持原配置。设置未通过格式/能力限制检查时不覆盖现有文件。

当前 GLM-5.3 默认 max、temperature 1、topP .95、1M 上下文。Chat Completions 明确映射 SDK max，启用 zai thinking + clear_thinking:false + tool_stream；GLM-5.3 该协议不接受 medium。Responses 将强度写入 reasoning.effort。Anthropic 通过 thinking.budget_tokens 映射四档（1024/4096/8192/16384），不假称与 Chat reasoning_effort 完全等价；界面配置返回 warnings，说明兼容网关对预算的执行由服务端决定。Anthropic 当前限制 temperature=1、topP>=.95；不偷偷忽略其它值。单次输出上限改为32768以容纳明确思考预算。

实际证据：

- 当前真实 Anthropic 端点，新 max 思考配置工具循环 **9,478 ms**，1 次工具、5 个文本块，正确读取现场返回值。
- 真实 SDK 对本地临时 HTTP 捕获：Chat 请求明确携带 reasoning_effort=max、temperature=1、top_p=.95、thinking={type:enabled,clear_thinking:false}、stream=true、tool_stream=true。Anthropic max/high 分别发送16384/8192预算，Responses发送 reasoning.effort=max。只记录非敏感字段。
- 作者 update_flow 的可选 title 参数保存简短工作标题；files.change 时再次检查 titleEdited，永不覆盖并发手工命名。模型负责标题内容，没有分类业务或固定标题回退。

`pnpm exec tsx --test tests/assistant.test.ts` **16/16**，`pnpm typecheck:app` 通过；新增设置持久化/重开/空密钥继承/并发写入/无密钥报错/失败不覆盖/配置冻结/手工标题保护/实际SDK协议payload回归。HTTP设置表单和工作库体验由根与前端接线后验收。

G1 推荐 Chat Completions 配置还经 `https://open.bigmodel.cn/api/coding/paas/v4` 真实验证：**6,221 ms**，1 次工具、6 个文本块、14 字符工具参数流；模型在工具结果后返回实际值，max/temperature/topP/保留思考/工具流的推荐请求成功。该次仅临时覆盖探测配置，没有切换用户保存的协议。

## G2 正式 HTTP + 真实 Pi 自动标题验收（2026-09-20）

通过当前 `http://127.0.0.1:4321` 正式 API 独立创建工作 `914e98c5-cd55-4882-a63b-329a38c8a766`，长目标以“标题验收”开头，材料为一条会议记录。服务使用用户已保存的 workspace 配置：glm-5.3-flash、Anthropic Messages、max；全程未修改配置，也未触碰根验收工作。

1. `POST /api/works` 的初始机械截断标题为“标题验收：整理团队会议记录，将已经确定的行动与仍需澄清的”。随后 `POST .../actions {action:edit}` 经真实 Pi `update_flow` 生成 **“会议行动清单”**，保存值与实际工具参数 title 一致，且 `titleEdited=false`；不是机械截断。有效初始定义：`364d2719-de23-4bcc-9ef8-d211977f36d7`。
2. 正式 `rename` 动作改为 **“手工标题保留验收”**，`titleEdited=true`。再次发起真实编辑，只在选中节点任务末尾补充“正文不超过六行。”，并要求工具提供新的自动建议标题。Pi 实际提交 **“会后行动与待澄清清单”**，工具完成且节点定义确有合法变化，但最终工作标题仍为 **“手工标题保留验收”**，`titleEdited=true`；其它节点保持不变。新定义：`c3def6df-26a5-4f71-adfe-1220672578e2`。
3. 工作没有执行任何流程节点（runs 为空）。完成后已通过正式 `archive` 动作归档；`archivedAt=2026-09-19T18:25:07.311Z`。

整个独立验收 **68,928 ms，通过**。这是正式 HTTP 与真实模型的标题行为证据，不是 mock 或直接编辑工作文件。
