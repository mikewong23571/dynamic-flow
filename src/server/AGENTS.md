# 单进程后端与模块组装

继承根与 src 约定。`index.ts` 是正式 Hono HTTP/SSE 入口；`createApplication({dataRoot?, executeNode?})` 创建应用与模块，直接运行此文件才启动监听，默认端口 4321（可用 PORT/HOST 配置）。

## 模块装配地图

| 工厂 / 所在目录 | 负责的结果 | 依赖与交接 |
| --- | --- | --- |
| `createFiles` / [files](files/AGENTS.md) | 方法文件、定义、上传文件及保存通知 | Node 文件能力；不反向调业务 |
| `createWorkService` / [work](work/AGENTS.md) | 流水线列表/维护、样例材料、保留结果及续做预览 | files；续做执行由入口交给 runs |
| `createFlow` / [flow](flow/AGENTS.md) | 定义校验、草稿/候选/采用、布局与 Snapshot | files、shared、Ajv |
| `createAssistant` / [assistant](assistant/AGENTS.md) | 作者请求、Agent 节点执行、Pi 会话和模型配置 | flow、files、Pi SDK |
| `createWorkItems` / [work-items](work-items/AGENTS.md) | 独立业务身份、证据、条件依据、关联与结项重开 | 自己保存工作项文件，经 files 读取方法/运行；launch/signal 接收运行回调 |
| `createRuns` / [runs](runs/AGENTS.md) | 固定输入执行、实例、停止/重试、等待与恢复 | files、flow；入口传入 executeNode、onMilestone、onFinish |
| `createTrials` / [trials](trials/AGENTS.md) | 同样本两侧顺序比较和停止 | runs、files、flow 校验 |

不要为这些直接调用增加 controller/service/repository 套层、第二个 Agent loop、消息队列或通用路由框架。以上是当前组织方式，具体反例可推动边界调整。

## HTTP 路由与数据

| 路由 | 实际行为 |
| --- | --- |
| `GET /api/config`、`PUT /api/config/catalog`、`PUT /api/config/default`、`POST /api/config/test` | 读取公开目录、保存目录/默认选择、测试模型；不回传密钥 |
| `POST /api/works/:id/model-selection` | 保存本工作 Assistant 模型覆盖 |
| `GET/POST /api/works` | 分页搜索流水线 / 创建方法工作区 |
| `GET /api/works/:id` | 返回 Snapshot：Work + 实际定义内容 + 校验问题 |
| `POST /api/works/:id/actions` | switch 分派命名、归档、材料、草稿、运行、比较、作者等动作；完成分派后返回 Snapshot |
| `POST /api/works/:id/invoke` | 一次性触发：裸值包装为 InputItem（ad-hoc 无材料来源），definition 缺省 adopted；声明 inputContracts 的端口违约默认 400 拒绝，`mode:"loose"` 显式豁免、`onInvalid:"interpret"` 走 assistant.repairInvocation 修复环，均留痕 Run.invocation；`wait` 同步等终态返回 outputs，超时 202 |
| `POST /api/works/:id/preview-results` | 所选成功结果 → 带来源 Inputs，不执行续做 |
| `GET/POST /api/works/:id/uploads` | 列出 / 保存上传文件；上传不等于登记为材料 |
| `GET /api/works/:id/events` | SSE 完整 snapshot 与 ping；不是增量业务事件回放 |
| `GET/POST /api/items`、`GET /api/items/:id` | 工作项查询 / 创建 / 详情 |
| `POST /api/items/:id/actions` | 证据、条件、推进、事件、停止、恢复、方法切换、结项与重开 |

具体 action 字段以 index.ts 的 switch 和调用方为准，共享记录在 `../shared/records.ts`，生命周期例子见 [handoff](../../conductor/tracks/workitem-lifecycle_20260920/handoff.md)。长任务在后台推进，动作响应不代表执行完成。错误返回 error 与可选 issues；模型失败不回退模拟成功。

## 需要沿链路检查的行为

- **手工编辑**：client → actions/saveDraft → flow → files.change → Snapshot。**作者编辑**：assistant.update_flow → 同一 flow 保存路径 → 同一保存通知。只有真实保存才能更新画布。
- **执行与业务进展**：runs → executeNode（默认 assistant.executeNode）；正式里程碑通过 `items.milestone` 写业务，运行完成不自动结项。
- **保存与实时更新**：files.onChange 标记更新，SSE 每 50ms 合并通知、15s ping；发送带 revision 的完整快照。前端按版本接受并保留未提交草稿。工作项详情通过只读轮询读取，不通过 GET 推进运行。
- **启动恢复**：`files.onServerStart` 标记不确定执行 → `items.reconcile` 补齐跨文件运行关联 → `runs.recover` 恢复持久等待。页面刷新不能调用这一启动路径。
- **文件导入**：uploads 保存 → `importMaterials` → `canonicalProfileDefinition` / `seedProfileFlow` 取得并按文件实例化剖析定义 → `runs.start` → `onFinish: finishImportRun` 登记材料/洞见及消息。规范初值在 `assistant/profile-flow.ts`；已存在内建流水线时读取其采用版本。导入副本写入 definitionIds，不占调用方 draft/adopted。当前 importRuns 收尾映射在内存，不把运行等待恢复等同于导入收尾映射已持久化。

## 验证与修改边界

`tests/integration.test.ts` 检查 HTTP/SSE，`tests/lifecycle-integration.test.ts` 检查工作项接线，`tests/lifecycle-process.test.ts` 检查真实子进程重启，`tests/profile-import.test.ts` 检查导入分支与收尾。路径从仓库根目录计算；执行方式与证据分类见 [测试指南](../../tests/AGENTS.md)。

`createApplication` 默认 dataRoot 为 `data/`，集成测试传临时目录和 executeNode 替身；替身通过不表示 Pi 端点已验证。构建静态文件通过本入口的 dist 回退提供；开发前端由 Vite 4320 代理 /api 到 4321。

变更路由/回调应同步 client、shared 和相邻模块，至少验证一个真实连接。当前为单进程本地原型；容量、多进程与未知端点兼容不能从单次 HTTP 200 推断。验收结论从 [track 注册表](../../conductor/tracks.md) 找对应 evidence。

`POST /api/works/:id/actions` 新增 `freezeExpansion`（expectedDraftId/runId/nodeId），委托 flow 写候选并返回同一 Snapshot；不采用、不提交业务进展。Dynamic 与 Repeat 由原 runs 执行，入口不增加第二个运行器。
