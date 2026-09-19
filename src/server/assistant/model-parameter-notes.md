# GLM-5.3-Flash 参数核查（只读，2026-09-20）

本轮未更改 `.env.local`、协议选择、模型元数据或采样参数。只核对安装的 Pi 0.85.1 源码与官方文档，并以假密钥向本地临时 HTTP 服务发出一次当前 SDK 请求捕获 payload；没有为参数研究调用外部模型。

## 当前实际请求

当前 `runPiSession` 配置 `reasoning:false`、`contextWindow:128000`、`maxTokens:8192` 与 session `thinkingLevel:'off'`。本地捕获的 Anthropic Messages 请求：

| 字段 | 实际发送 |
| --- | --- |
| model | glm-5.3-flash |
| stream | true |
| max_tokens | 8192 |
| thinking | 省略 |
| reasoning_effort | 省略 |
| temperature / top_p | 省略 |
| tool_stream | 省略（这是 Chat Completions 扩展字段） |
| tools[].eager_input_streaming | true（Anthropic 工具流字段） |

因此当前并没有向服务端明确关闭思考。`reasoning:false` 阻止 Pi 输出思考控制字段；服务端仍可能默认执行思考。不能把内部 thinkingLevel=off 描述为模型真实“不思考”。如果仅把 reasoning 改成 true、继续保留 off，Pi 的 Anthropic 适配器可能改发 `thinking:{type:'disabled'}`，同样不是正确的 GLM-5.3 配置。

128000 是当前应用声明给 SDK 的上下文预算，影响本地令牌估计和输出预算裁剪，不是服务端收到的 context 参数。它低估该模型的能力；官方标为 1M。8192 是应用当前主动请求的输出上限，可作为成本/响应长度选择，不应当称为模型最高输出能力（官方为 128K）。

## 官方文档结论

已直接获取[对话补全接口文档](https://docs.bigmodel.cn/api-reference/模型-api/对话补全.md)和[GLM-5.3-Flash/FlashX 模型文档](https://docs.bigmodel.cn/cn/guide/models/vlm/glm-5.3-flash.md)。网页检索服务未能加载这两页，直接 HTTPS 返回了官方 Markdown；结论来自实际文档正文。

- Flash/FlashX：1M 上下文、128K 最大输出；推荐 temperature=1、top_p=0.95、reasoning_effort=max。
- thinking.type 只支持 enabled；推理强度支持 low/high/max。建议 clear_thinking=false。
- 流式工具建议 stream=true 与 tool_stream=true。
- 保留思考需要完整、不修改且顺序不变地传回历史 reasoning_content；仅设置 clear_thinking=false 不能代替这个条件。
- 对话补全文档把 temperature=1、top_p=0.95、reasoning_effort=max 列作 Flash 系列默认值，但不可据此断言 Anthropic 兼容网关有完全相同的默认和映射。

## 若之后选择推荐的 Chat Completions 配置，最小 SDK 改法

不需要新 ProviderFactory 或自行实现 Agent loop。仍使用当前 ModelRuntime/createAgentSession，仅在适用的 GLM-5.3 Chat Completions 模型配置中设：

```ts
reasoning: true,
contextWindow: 1_000_000, // 对应官方 1M；本地预算
thinkingLevelMap: {
  off: null,
  minimal: null,
  low: 'low',
  medium: null,
  high: 'high',
  xhigh: null,
  max: 'max',
},
samplingParams: { temperature: 1, top_p: 0.95 },
compat: {
  supportsStore: false,
  supportsDeveloperRole: false,
  maxTokensField: 'max_tokens',
  thinkingFormat: 'zai',
  supportsReasoningEffort: true,
  zaiToolStream: true,
},
// createAgentSession 选 thinkingLevel: 'max'
```

SDK 已实现相应映射：zai + reasoning true + max 产生 `thinking:{type:'enabled',clear_thinking:false}`；显式 supportsReasoningEffort=true 才会加 reasoning_effort。这个 override 必要，因为安装版本自动检测 bigmodel/zai 时仍将 supportsReasoningEffort 设为 false。zaiToolStream=true 会在存在工具时加入 tool_stream=true；stream 原本即为 true。samplingParams 经模型传入，并在 Chat Completions 请求构造末尾合入，能设置 temperature/top_p。

Pi 只在 thinkingLevelMap 明确声明时允许 max，不能仅写 session thinkingLevel=max。SDK 对返回的 reasoning_content 保存其签名并在后续工具轮次按原字段传回，因此无需应用把推理文本拼接到普通用户正文中。仍需未来用一次真实工具多轮调用确认提供商的保留思考行为；本轮没有把拟议配置标为真实验证通过。

以上适用于选择 Chat Completions 的情况，不能将这些字段直接照搬给当前 Anthropic 协议。当前协议如要精确配置同等行为，应先核对供应商对应的 Anthropic 参数约定和实际 payload，再联动修改 reasoning 元数据与 session 思考等级，避免只改一半。

## 安装源码依据

- `src/server/assistant/pi.ts:69–107`：当前元数据与 session 思考等级。
- `pi-ai/dist/api/anthropic-messages.js:851–873`：reasoning 条件下才输出 thinking，off 可输出 disabled。
- `pi-ai/dist/api/openai-completions.js:613–641`：tool_stream 与 zai thinking/clear_thinking/reasoning_effort 映射。
- `pi-ai/dist/api/openai-completions.js:1280–1303`：zai 自动检测的 supportsReasoningEffort=false、zaiToolStream=false 默认。
- `pi-ai/dist/api/simple-options.js:10–17` 与 `openai-completions.js:760–763`：模型 samplingParams 合入请求。
- `pi-ai/dist/models.js:551–580`：支持的思考等级与 max 的显式映射要求。
- `pi-ai/dist/api/openai-completions.js:980–1008`：reasoning_content 的工具后续轮次回传。

## 后续授权后的实现状态：G1

上文是参数核查时的历史快照。用户随后明确授权客户端配置整套 LLM API，现已在 `settings.ts` 与 `pi.ts` 实现，不再使用上文 reasoning:false/128k/off 的旧默认。

`configuration/saveConfiguration` 使用服务器设置文件与 .env 回退；三协议参数按协议发送，GLM-5.3 默认 max/1/.95/1M。Chat 的原建议映射已实现并用真实 SDK 本地请求捕获逐字段验证。Anthropic 不照搬 Chat 专有参数，而以明确的思考预算映射四档，返回 warnings 如实说明语义；真实当前端点的新 max 配置工具循环已通过。Responses 的 reasoning.effort=max 亦有实际 SDK payload 捕获。新域内测试16/16通过；精确证据见 probe-results.md 的 G1 节。
