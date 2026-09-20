# 实施计划

详细设计见 [规格](spec.md)（含闭环分析、解析链、接口形状、明确不做）。

## Phase 1：目录与类型

- [x] 新增依赖 `smol-toml`；`.gitignore` 加 `models.toml`；新增 `models.example.toml`
- [x] `src/shared/records.ts`：`ModelCatalogEntry`、`ModelSelection`、`ModelScope`、`EffectiveModel`；`Work.modelSelections`；`ChatMessage`/`NodeResult.effectiveModel`；`ModelConfiguration` 扩展
- [x] `src/server/assistant/catalog.ts`：`loadCatalog` / `resolveModel` / `saveCatalog`（TOML 校验、协议映射、headers、原子写）
- [x] `tests/model-catalog.test.ts` 全绿

## Phase 2：解析链与服务接线

- [x] `settings.ts`：`catalogPath`、`getScopedConfig`、`saveDefaultSelection`、`testCatalogEntry`、ready 综合语义
- [x] `config.ts`：`ModelConfig.headers`；`pi.ts`：透传 `headers`
- [x] `assistant/index.ts`：requestEdit/executeNode 按解析链取配置；effectiveModel 写入消息/节点结果；`saveWorkSelection`
- [x] `server/index.ts`：`PUT /api/config/catalog`、`PUT /api/config/default`、`POST /api/config/test`、`POST /api/works/:id/model-selection`
- [x] 选择语义与回退测试全绿；`pnpm typecheck:app`、`pnpm test` 全绿

## Phase 3：前端

- [x] 安装 `@assistant-ui/model-selector` registry 元素（shadcn CLI 在本机网络不可用，改为按 registry JSON 手工 vendor 等价源码 + popover/command 与 cmdk，受控模式）
- [x] `ModelSettingsDialog.tsx` 重构：默认模型区块、Provider/模型管理、测试按钮、高级自定义端点
- [x] `Assistant.tsx` composer footer 切换器（覆盖/跟随默认）
- [x] 消息与节点结果的 effectiveModel 小字展示；错误消息「检查模型设置」动作

## Phase 4：证据与文档

- [x] 浏览器实操证据（composer 切换、管理增删改、测试连接）+ 1440/1024 截图，写入 evidence.md
- [ ] 真实端点测试连接证据（与确定性测试分开记录）（无真实密钥，留待后续；失败路径已用不可达端点验证）
- [x] 同步 `src/server/assistant/AGENTS.md`、`src/shared/AGENTS.md`、`src/client/AGENTS.md`
- [x] tracks.md 勾选完成，metadata.json 置 completed
