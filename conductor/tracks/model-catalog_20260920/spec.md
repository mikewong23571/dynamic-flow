# 模型目录 + 全局默认/助手覆盖的模型选择 实施计划

## 目标与语义（已与用户确认）

1. **模型目录**：参考 `~/.kimi-code/config.toml` schema（`[providers.*]` + `[models."provider/model"]`），在全局「模型设置」入口内管理 provider 与 model 的增删改（含密钥、custom_headers、支持思考强度）。
2. **全局默认**：「模型设置」里设一个默认模型+思考强度，作用于没有覆盖的一切调用，包括 workflow 执行（executeNode）。
3. **助手按 Work 覆盖**：每个 Work 的对话（requestEdit 生成/修改做法）可在 composer 处单独选择模型+强度，只影响本工作，可清除恢复"跟随默认"。
4. **解析链**：
   - `requestEdit`（assistant）= Work 助手覆盖 → 全局默认 → 手动配置（`.env.local` / `data/model-settings.json`，G1 行为不变）；
   - `executeNode`（workflow）= 全局默认 → 手动配置。
   目录别名被删导致选择失效时，如实回退下一级并说明，不静默假装仍是所选模型。

现状：单一全局配置。`src/server/assistant/settings.ts` 的 `createModelSettings` 读 `data/model-settings.json`；`requestEdit`/`executeNode` 共用一个 `getConfig()`；`ModelSettingsDialog.tsx` 编辑这一份；`/api/config` 在 `src/server/index.ts:178`。对话面板用 `useExternalStoreRuntime`（`Assistant.tsx:97`），发送走自有 api 客户端。

## 闭环分析（第一性原理）

模型设置的目的 = 用户真实任务被真实模型正确执行。闭环六环：声明 → 选择 → 生效 → 验证 → 观测 → 修复。计划覆盖前三环；后三环补充如下，均为小成本高确定性：

- **验证环（测试连接）**：管理界面每个模型条目加「测试」→ `POST /api/config/test`，服务端按条目解析 config 跑 probe 式最小真实会话（一次工具调用 + 固定值回显，思路来自现有开发者脚本 `probe.ts`，不回退假模型），返回 成功/耗时/脱敏真实错误。
- **观测环（生效披露）**：解析配置时把 `{source: 'work'|'default'|'manual'|'env', alias?, model, effort}`（无密钥）写入 `ChatMessage` 与 `NodeResult`；UI 小字展示；回退发生如实标注。与"冻结输入随结果保存"哲学一致。
- **修复环**：模型业务错误消息带「检查模型设置」动作；`configuration()` 的 `ready` 从"只看 apiKey"扩展为如实综合（目录解析错误、默认/覆盖失效均上浮）。

## 关键决策

- **目录格式 TOML**（`models.toml`，仓库根，进 `.gitignore`，0600），与 kimi-code schema 一致；新增依赖 `smol-toml`（parse + stringify）。界面管理 = 整份目录校验后原子重写（注释会丢，可接受）；手改文件也有效（服务端每次请求重读）。提交 `models.example.toml` 模板（无真实密钥）。
- **协议映射**：provider `type` = `anthropic`→`anthropic-messages`、`openai`→`openai-completions`、`openai-responses`→`openai-responses`；未知类型（如 `kimi`/oauth）加载时报明确错误。`custom_headers` 透传 pi-ai `registerProvider` 的 `headers`（已确认 SDK 支持）。
- **思考强度沿用现有 `reasoningEffort` union（low/medium/high/max）**；目录加载时校验 `support_efforts`/`default_effort` 只含这四个值。Anthropic 预算映射、GLM 限制等协议语义不动。
- **存储**：
  - 全局默认选择存 `data/model-settings.json` 新增可选字段 `defaultSelection?: ModelSelection`；
  - 助手覆盖存 Work 记录可选字段 `modelSelections?: { assistant?: ModelSelection }`（结构留 scope 位，后续加 workflow 覆盖不破 schema）。
  - `ModelSelection = { alias: string; effort?: 'low'|'medium'|'high'|'max' }`。旧数据无这些字段正常读取。
- **UI 组件复用**：composer 切换器用 assistant-ui registry 元素 `@assistant-ui/model-selector`（`npx shadcn@latest add`，源码进项目，受控模式）。注意：它的 ModelContext 自动注册依赖 useChatRuntime，我们不走那条链路，`onValueChange`/`onEffortChange` 直接调自己的 API。

## 实施步骤

### 1. 共享类型（`src/shared/records.ts`）

- `ModelCatalogEntry`（公开、无密钥）：`{ alias, provider, model, displayName, protocol, baseUrl, contextWindow, supportedEfforts, defaultEffort, apiKeyConfigured }`。
- `ModelSelection`、`ModelScope = 'assistant' | 'workflow'`（scope 类型现在定义，workflow 覆盖暂不使用）。
- `Work` 增加 `modelSelections?: { assistant?: ModelSelection }`。
- `ModelConfiguration` 增加 `catalog?: ModelCatalogEntry[]`、`defaultSelection?: ModelSelection`、`resolved?: { default: 'catalog' | 'manual' | 'env' }` 供界面标注生效来源；`ready` 语义见步骤 3。
- **生效披露**：新增 `EffectiveModel = { source: 'work' | 'default' | 'manual' | 'env'; alias?: string; model: string; effort?: ModelSelection['effort'] }`（无密钥）；`ChatMessage` 与 `NodeResult` 各增加可选字段 `effectiveModel?: EffectiveModel`。旧数据无此字段正常读取。

### 2. 服务端目录（新文件 `src/server/assistant/catalog.ts`）

- `loadCatalog(path)`：读 TOML → 校验 → 内部条目（含 apiKey/headers）+ 公开条目。文件不存在 = 空目录。
- 校验：provider 的 type/base_url/api_key 必填、URL 合法；model 引用存在的 provider；effort 值合法；contextWindow 8192–2000000；错误消息中文、指明条目。
- `resolveModel(catalog, selection)` → `ModelConfig`（`config.ts` 的 `ModelConfig` 加 `headers?: Record<string,string>`）；effort 缺省用 `defaultEffort`，temperature/topP 用现有 `modelDefaults`。
- `saveCatalog(path, catalog)`：整份校验（空 apiKey 沿用旧值）→ stringify → tmp+rename 原子写，0600。

### 3. 设置与会话接线（`settings.ts`、`pi.ts`、`assistant/index.ts`）

- `createModelSettings` 增加 `catalogPath`；`configuration()` 附加公开 `catalog` 与 `defaultSelection`；`getConfig()` 保留为手动回退。
- 新增 `getScopedConfig(scope: ModelScope, work?)`：
  - assistant 且 work 有覆盖且别名有效 → 目录解析；
  - 全局 defaultSelection 有效 → 目录解析；
  - 否则 `getConfig()`。
  返回 `{ config, effective: EffectiveModel }`，调用方把 `effective` 写入消息/节点结果。
- `requestEdit` 读 work 后用 `getScopedConfig('assistant', work)`，将 `effective` 写入本次 assistant `ChatMessage.effectiveModel`；`executeNode` 用 `getScopedConfig('workflow')`，`effective` 经 runs 写入 `NodeResult.effectiveModel`（NodeExecution 增加可选字段传递，配置在请求开始固定）。
- 新增 `saveDefaultSelection(selection | null)`：校验别名与 effort，与现有 `writes` 队列串行、原子写 `data/model-settings.json`。
- 新增 `saveWorkSelection(workId, selection | null)`：校验后 `files.change` 写 Work 记录的 assistant 覆盖；`null` 清除（跟随默认）。
- 新增 `testCatalogEntry(alias)`：按条目解析 config，跑一次最小真实会话（一个工具调用 + 固定值回显，约 90s 超时），返回 `{ ok, latencyMs, error? }`，错误经 `safeError` 脱敏；不保存任何状态。
- `configuration()` 的 `ready` 扩展为如实综合：目录解析错误、defaultSelection 失效时 `ready:false` 并在 `error`/warnings 说明具体原因。
- `saveCatalog` 暴露为 service 方法；`pi.ts` 的 `registerProvider` 透传 `headers`。

### 4. HTTP（`src/server/index.ts`）

- `GET /api/config`：现有字段 + `catalog` + `defaultSelection` + `resolved`。
- `PUT /api/config/catalog`：整份目录保存。
- `PUT /api/config/default`：body `{ selection | null }` → `saveDefaultSelection`。
- `POST /api/config/test`：body `{ alias }` → `testCatalogEntry`。
- `POST /api/works/:id/model-selection`：body `{ selection | null }` → `saveWorkSelection`（assistant 覆盖），走现有 work 动作/SSE 快照回执模式。

### 5. 前端

- **安装元素**：`npx shadcn@latest add "@assistant-ui/model-selector"`（连带 cmdk 等依赖；源码落 `components/`，按项目 components/ui 约定调整 import 与暗色样式）。
- **`Assistant.tsx`**：composer footer（`Assistant.tsx:233` 附近）放 ModelSelector（sm/ghost），受控值 = 本 Work 的 assistant 覆盖（无覆盖时显示"默认：xxx"）；`onValueChange`/`onEffortChange` → `POST model-selection`；提供"跟随默认"项清除覆盖。目录为空或未就绪时隐藏。
- **`ModelSettingsDialog.tsx` 重构为管理入口**：
  - 「默认模型」区块：一个 ModelSelector + 强度，写 `PUT /api/config/default`；显示当前生效来源（目录 / 自定义端点 / 初始配置）。
  - 「Provider 与模型」管理：provider 卡片列表（标识/协议/地址/密钥状态/模型 chip），新增/编辑/删除；编辑表单含 type、base_url、api_key（密码框留空沿用）、custom_headers 键值行、该 provider 下模型条目（别名、model id、显示名、上下文、support_efforts 勾选、default_effort）。
  - 删除被全局默认或任一 Work 覆盖引用的 provider/model：服务端校验拒绝并提示先改选择（Work 引用检查由服务端扫 works 完成，原型规模可接受）。
  - 每个模型条目/ provider 卡片上加「测试」按钮 → `POST /api/config/test`，行内显示 通过（耗时）/ 失败（真实错误）。
  - 「自定义端点（高级）」：现有手动表单原样收进 `<details>`，G1 行为与校验提示不变。
- **生效披露展示**：assistant 消息与节点结果详情小字显示 `effectiveModel`（如"K3 · 较高 · 跟随默认"）；回退时显示"所选模型已失效，实际使用 xxx"。模型业务错误消息上加「检查模型设置」按钮，点击打开模型设置对话框。
- `App.tsx` 的 `configuration` 传递不变；work 快照经 SSE 更新后 composer 切换器自然刷新。
- 画布/NodeInspector 不加控件。

### 6. 模板与忽略

- `models.example.toml`（两 provider + 三模型条目注释示例）；`.gitignore` 加 `models.toml`。

### 7. 测试与证据

- `tests/model-catalog.test.ts`：TOML 解析/校验（缺 provider、未知别名、非法 effort、非法 URL、未知 type）、`resolveModel` 协议映射与 headers 透传、effort 默认/覆盖、公开条目无密钥、`saveCatalog` 原子重写与空密钥沿用。
- 选择语义测试（扩展 `tests/assistant.test.ts` 或新文件）：`saveDefaultSelection`/`saveWorkSelection` 校验与清除；两个 Work 各自助手覆盖互不影响；别名失效逐级回退；`requestEdit`/`executeNode` 按解析链取配置（替身 runSession 断言 config：assistant 用覆盖、workflow 用全局默认）；`effectiveModel` 写入消息与节点结果。
- `testCatalogEntry` 测试：用替身 runSession 断言调用形状与超时/错误脱敏；真实端点探测记录进 track 证据（与确定性测试分开）。
- `pnpm typecheck:app`、`pnpm test` 全绿。
- 浏览器证据：按 `src/client/evidence/model-settings-check.mjs` 模式补 composer 切换/跟随默认、管理对话框增删改的实操检查 + 1440/1024 截图（暗色 Geist，复用 components/ui）。

### 8. 文档同步

- `src/server/assistant/AGENTS.md`：G1 交接补目录与"Work 助手覆盖 → 全局默认 → 手动配置"解析链（密钥不出 API、失效如实回退、不回退假模型）。
- `src/shared/AGENTS.md`：Work.modelSelections、defaultSelection 与目录记录说明。
- `src/client/AGENTS.md`：对话框管理入口、composer 切换器交接。
- 按项目约定先用 conductor-new-track 建 track 再实施。

## 明确不做

- 不做 workflow 执行的按 Work 覆盖与画布控件（scope 机制已预留，有真实需求再加）。
- 不做节点级/定义级模型覆盖（不进 IR）。
- 不做成本/配额/用量统计（原型范围外；观测环只披露生效模型，不做计量）。
- 不读 `~/.kimi-code/config.toml` 本体（仅参考 schema；oauth/managed provider 不支持，遇到明确报错）。
- 不改 Anthropic 预算映射、GLM 限制、温度/Top P 校验等现有协议语义。
