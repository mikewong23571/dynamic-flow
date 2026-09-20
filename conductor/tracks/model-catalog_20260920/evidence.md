# 模型目录 track 验收证据

范围：Phase 1–3 实现（目录/解析链/界面）与 Phase 4 浏览器实操。确定性测试与真实浏览器证据分开记录；真实端点探测未做（占位端点 `http://127.0.0.1:9` 只用于验证失败路径）。

## 确定性测试（2026-09-20）

- `pnpm typecheck:app` 通过；`pnpm test` **137/137 通过**；`pnpm build` 通过。
- `tests/model-catalog.test.ts`（9 例）：TOML 解析与校验（缺 provider、未知类型、非法 URL/effort/context、default_effort 不在 support_efforts）、协议映射与 headers 透传、effort 默认/覆盖、公开条目无密钥、`saveCatalog` 原子重写/空密钥沿用/无旧密钥报错、点号别名 round-trip。
- `tests/model-selection.test.ts`（9 例）：默认选择校验/持久化/跨写者保留/清除；Work 覆盖独立与清除；解析链逐级回退（覆盖失效→默认→手动，`requested` 记录）；目录错误与默认失效时 configuration 如实不就绪；手动配置不可用时目录默认可解析即就绪；`requestEdit`/`executeNode` 替身 runSession 断言 config（assistant 用覆盖、workflow 用全局默认）与 effectiveModel 落盘；`testCatalogEntry` 形状/脱敏/未知别名；`saveCatalog` 拒绝删除被默认选择或 Work 覆盖引用的别名。
- `tests/client.test.ts` 新增 1 例：目录编辑器合并把模型行归属当前 provider（Phase 4 发现的 bug 回归）。

## 浏览器实操（2026-09-20）

方法：`artifacts/serve-evidence.mts` 起独立证据服务（127.0.0.1:4391，全新临时数据目录，服务 `pnpm build` 产物；不占用户 4320/4321 dev 进程、不污染 data/ 与 models.toml），`artifacts/browser-check.mjs`（Playwright，无路由 mock，占位密钥 `placeholder-key-not-real`、不可达端点 `http://127.0.0.1:9/v1`）实操并断言 HTTP 落盘。最终输出：`PASS: catalog CRUD, default selection, honest test failure (sanitized), composer override/follow-default, two-work independence, no key leak, no page errors`。

操作与实际结果：

1. 打开模型设置：默认模型区块（当前生效：初始配置）、Provider 与模型空态提示、自定义端点（高级）折叠区同在，无成片介绍文案（settings-empty-1440.png）。
2. 新增 Provider `evidence`（OpenAI Chat Completions、占位密钥、custom_headers `X-Evidence: 1`）+ 两个模型条目（evidence/glm-a「证据模型A」、evidence/glm-b「证据模型B」，B 默认强度较高）：表单见 provider-editor-1440.png；保存后卡片显示密钥已配置/自定义请求头徽标与两行模型（catalog-saved-1440.png）。`GET /api/config` 返回 2 条目、headersConfigured=true，响应不含占位密钥。
3. 默认模型选 evidence/glm-a + 较低，保存显示「默认模型已保存」「当前生效：模型目录」「模型已配置」徽标；`GET /api/config` 的 defaultSelection 为 `{alias:'evidence/glm-a',effort:'low'}`。
4. 对 evidence/glm-a 点「测试」：不可达端点行内如实显示失败（`Connection error.`，经 safeError 脱敏，页面任何处不出现占位密钥），不回退假成功（test-failure-1440.png）。
5. 自定义端点（高级）展开：G1 手动表单原样在内（manual-advanced-1440.png）；1024×768 无横向滚动（settings-1024.png）。
6. 工作甲对话 composer footer 切换器：初始显示「跟随默认：证据模型A」；切换为证据模型B、强度改较低，两次 `POST /api/works/:id/model-selection` 均 200，`GET /api/works/:id` 落盘 `modelSelections.assistant = {alias:'evidence/glm-b',effort:'low'}`（composer-override-1440.png）。
7. 工作乙选择证据模型A（medium），甲的记录保持 `{glm-b, low}` 不变，两 Work 覆盖互不影响；乙切回「跟随默认」后 `modelSelections` 字段清除，触发器回到「跟随默认：证据模型A」（composer-follow-default-1440.png；1024 见 composer-1024.png）。侧栏底部同步显示「证据模型A · 推理较低」。

## 发现并已修复的问题（均有回归测试）

1. **目录编辑器 provider 归属 bug**：新建 Provider 时模型草稿行在名称填写前创建，`provider` 字段为空串，整份保存被服务端拒绝「引用了不存在的 provider『』」。修复：`catalog-model.ts` 新增纯函数 `mergeEdited`（编辑器模型行统一归属当前 provider），`CatalogManager.saveEditor` 改用之；`tests/client.test.ts` 补回归。
2. **ready 语义缺陷**：只配置目录默认（手动层无密钥/env）时 `configuration().ready` 仍为 false，工作区常驻「模型配置缺少 LLM_*」横幅，但解析链实际可用。修复：目录默认可解析即 ready（try/catch 两条路径），手动层不可用降级为 warnings；侧栏底部在目录默认生效时显示目录显示名而非「尚未配置」。`tests/model-selection.test.ts` 更新断言并补无效默认不就绪用例。修复前后对比见 composer-override（旧运行曾带横幅）与 composer-follow-default-1440.png（修复后无横幅）。
3. **脚本适配**：`src/client/evidence/model-settings-check.mjs`（G1 响应替身 fixture）因对话框重构更新：先展开「自定义端点（高级）」、「推理强度」精确匹配（默认模型区块新增「默认推理强度」 combobox）、地址可用 `APP_URL` 覆盖。已对证据服务跑通 PASS。

## 偏差与未做

- shadcn CLI 网络不可用，model-selector 为按 registry JSON 手工 vendor（含 popover/command/cmdk），受控模式；细节见 plan.md 与 src/client/AGENTS.md。
- 「测试连接」对不可达端点的失败文案是 SDK 真实错误（英文 `Connection error.`），如实展示且脱敏；未额外包装中文说明。
- 真实端点探测未做（无真实密钥要求）；composer 切换器在 `ready=false` 但目录有条目时仍显示（目录可用即可选，规格「未就绪隐藏」按配置未加载理解）。
- 证据服务脚本与检查脚本保留在 `artifacts/` 供复跑：先 `pnpm build`，再起 `serve-evidence.mts`，全新数据目录下跑 `browser-check.mjs`（脚本假设空目录起步）。

## 返工（2026-09-20，用户实操反馈）

用户实操后指出三处问题，均已修复并重新截图验证：

1. **删除自定义端点（用户决定：原型不需要兼容性）**：对话框移除「自定义端点（高级）」；服务端移除手动/env 回退链，目录（models.toml）成为唯一配置来源。解析链变为 assistant = Work 覆盖 → 全局默认 → 未配置报错；workflow = 全局默认 → 未配置报错。`createModelSettings` 签名改为 `(path, catalogPath)`；`createAssistant` options 移除 `config`；`POST /api/config` 手动保存路由删除。覆盖与默认同时失效时错误同时指明两者。测试迁移：`tests/catalog-fixture.ts` 的 `seedCatalog` 统一种子目录；`tests/model-selection.test.ts` 重写为目录唯一语义；functional-author/multi-input-author 测试迁到 seedCatalog。`pnpm typecheck:app` 通过、`pnpm test` **136/136 通过**（手动配置用例随功能移除）。
2. **布局按内容长度重排**：base_url/API 密钥等长值在两栏下显示不全——改为长值（服务地址、API 密钥）独占整行，短值（名称/协议、显示名/上下文窗口、强度）两栏；请求头行 1:2；`.settings-divider` 改 flex 使「自定义请求头 + 添加」「模型 + 新增模型」同行对齐；修复 `.model-settings .field` 与 grid gap 叠加的双倍间距；强度标签统一英文（Reasoning effort / Supported efforts / Default effort / low–max）。
3. **交互逻辑重做**（用户质疑保存语义混乱与对话框内跳页）：默认模型改为**改完即存**（偏好切换即时生效，行内「已保存」反馈）；provider 编辑改为**卡片就地展开**（不离开列表上下文，一张卡片一次显式保存）；删除改为**两步确认**（删除 → 确认删除，此前是立即生效）；空目录初始态不再显示红色错误横幅（有目录但未选默认时才提示）。修复 API 密钥标签与「必填/留空沿用」折行。

浏览器复查：`artifacts/layout-check.mjs` 对干净证据服务跑通（SHOTS_OK），逐张人工检查 `browser/r1-empty-1440`（空态无横幅）、`r2-editor-1440`（长 URL/密钥整行、divider 对齐）、`r3-catalog-1440`（卡片列表）、`r4-default-1440`（即存+徽标）、`r5-confirm-1440`（两步删除）、`r6-editor-1024`（1024 无横向滚动）。`src/client/evidence/model-settings-check.mjs` 重写为即存语义并对证据服务 PASS（断言 PUT 体、无密钥回显、无自定义端点表单、无 pageerror）。

## 思考级别与模型编辑返工（2026-09-20，用户实操反馈）

- **词表扩为 7 档**：调研主流模型实际取值（OpenAI `none/minimal/low/medium/high/xhigh/max` 按模型而定；Claude `low/medium/high/xhigh/max`；Kimi/GLM `low/high/max`），词表与运行时 pi thinkingLevel 对齐为 `off/minimal/low/medium/high/xhigh/max`（OpenAI none 以 off 表示）。`ReasoningEffort` 类型、目录校验、Anthropic 预算映射同步扩展。
- **Thinking efforts 改整行勾选**：调研主流模型实际取值（OpenAI `none/minimal/low/medium/high/xhigh/max` 按模型而定；Claude `low/medium/high/xhigh/max`；Kimi/GLM `low/high/max`），词表与运行时 pi thinkingLevel 对齐为 `off/minimal/low/medium/high/xhigh/max`（OpenAI none 以 off 表示）。7 个值一行 flex-wrap 勾选，无拼写错误、词表可见；不再并列两栏（竖排复选框会挤、两边控件样式不一致、集合与成员是从属关系）。`off` 可勾选 = 允许运行时选择不思考；全不选 = 不设置思考级别（`support_efforts = []`，解析为 off，`tests/model-catalog.test.ts` 新增用例）。Default effort 下拉跟随勾选集合；非法值（手改 TOML）服务端中文报错。`ReasoningEffort` 类型、目录校验、Anthropic 预算映射同步扩展。
- **模型卡片可折叠**：默认折叠为一行（别名 + 显示名 + 移除），chevron 展开编辑，新增模型自动展开；「新增 Provider / 新增模型 / 添加请求头」统一在区头右侧（此前新增 Provider 在列表底部、新增模型在区头，不一致）；请求头行补移除按钮。
- 复查：`artifacts/efforts-check.mjs` PASS（自定义 7 档子集、留空不设置、折叠/展开保值、非法值行内错误），截图 `browser/r9–r13`；`pnpm test` 137/137。
