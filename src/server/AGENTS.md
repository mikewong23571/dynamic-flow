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
| `GET/POST /api/items`、`GET /api/items/:id` | 工作项查询（含全局 summary 和 pending 筛选） / 创建 / 详情 |
| `POST /api/items/:id/actions` | 证据、条件、推进、reportProgress 报告、事件、停止、恢复、方法切换、结项与重开 |

具体 action 字段以 index.ts 的 switch 和调用方为准，共享记录在 `../shared/records.ts`，生命周期例子见 [handoff](../../conductor/tracks/workitem-lifecycle_20260920/handoff.md)。长任务在后台推进，动作响应不代表执行完成。错误返回 error 与可选 issues；模型失败不回退模拟成功。

## 需要沿链路检查的行为

- **手工编辑**：client → actions/saveDraft → flow → files.change → Snapshot。**作者编辑**：assistant.update_flow → 同一 flow 保存路径 → 同一保存通知。只有真实保存才能更新画布。
- **执行与业务进展**：runs → executeNode（默认 assistant.executeNode）；正式里程碑通过 `items.milestone` 写阶段，普通 full/commit Agent 的 `report_progress` 通过注入的 `items.reportProgress` 写模型报告；运行完成不自动结项。
- **保存与实时更新**：files.onChange 标记更新，SSE 每 50ms 合并通知、15s ping；发送带 revision 的完整快照。前端按版本接受并保留未提交草稿。工作项详情通过只读轮询读取，不通过 GET 推进运行。
- **启动恢复**：`files.onServerStart` 标记不确定执行 → `items.reconcile` 补齐跨文件运行关联 → `runs.recover` 恢复持久等待。页面刷新不能调用这一启动路径。
- **文件导入**：uploads 保存 → `importMaterials` → `canonicalProfileDefinition` / `seedProfileFlow` 取得并按文件实例化剖析定义 → `runs.start` → `onFinish: finishImportRun` 登记材料/洞见及消息。规范初值在 `assistant/profile-flow.ts`；已存在内建流水线时读取其采用版本。导入副本写入 definitionIds，不占调用方 draft/adopted。当前 importRuns 收尾映射在内存，不把运行等待恢复等同于导入收尾映射已持久化。

## 验证与修改边界

`tests/integration.test.ts` 检查 HTTP/SSE，`tests/lifecycle-integration.test.ts` 检查工作项接线，`tests/lifecycle-process.test.ts` 检查真实子进程重启，`tests/profile-import.test.ts` 检查导入分支与收尾。路径从仓库根目录计算；执行方式与证据分类见 [测试指南](../../tests/AGENTS.md)。

`createApplication` 默认 dataRoot 为 `data/`，集成测试传临时目录和 executeNode 替身；替身通过不表示 Pi 端点已验证。构建静态文件通过本入口的 dist 回退提供；开发前端由 Vite 4320 代理 /api 到 4321。

变更路由/回调应同步 client、shared 和相邻模块，至少验证一个真实连接。当前为单进程本地原型；容量、多进程与未知端点兼容不能从单次 HTTP 200 推断。验收结论从 [track 注册表](../../conductor/tracks.md) 找对应 evidence。

`POST /api/works/:id/actions` 新增 `freezeExpansion`（expectedDraftId/runId/nodeId），委托 flow 写候选并返回同一 Snapshot；不采用、不提交业务进展。Dynamic 与 Repeat 由原 runs 执行，入口不增加第二个运行器。

`GET /api/works/:id` 仅在对应 `work.json` 不存在时返回 404 / `WORK_NOT_FOUND`，供浏览器清理已失效的打开入口；缺定义等其它读取失败保持原错误，不冒充整个流水线已删除。

工作项分治新增接口：`GET /api/items?summary=true`返回独立摘要分页合同，支持parentId/rootId/view/todo/ids；旧无summary参数仍返回原列表。`POST /api/items/:id/prepare`只读生成明确绑定、实际值和缺口；actions增加createChildren/candidates（可page/pageSize）/reviseInput/scope/completionInputs。层级变更需确认时错误体带affectedAncestors。run仍是唯一正式启动入口，支持received/completion输入；应用内工作项批次保存明确选择，按受限并发通过同一run入口自动启动，关闭页面不停止批次。

运行器onCreateItems在入口验证当前工作项、full/commit、非比较及活动运行后调用items.createChildren；节点首次固定输入引用由runtime提供。返回逐项回执，失败和停止仍由runtime保存真实状态。GET `/api/works/:id?runIds=...`为只读检查裁剪Snapshot.work.runs，编辑工作区无参数仍取得原快照；不重写磁盘运行记录。

工作项 actions 增加 stageInputs（只读发现直属子项正式阶段产物）和 stagePreview（selection: child-results，按需读取完整所选值）；inputBindings统一保存明确来源，prepare只读解析当前保存绑定。run 使用 child-results 时不要求子项业务结项，仍固定本轮输入并保留原有完成条件与范围约束。

## 工作项自动批次

`work-items/batch-runs.ts` 保存工作项批次：明确 parent、方法版本与各项输入，最多四项并发，默认两项；每项通过现有正式 run 接口启动并保留独立 Run。GET/POST `/api/item-batches` 查询/创建，`/api/item-batches/:id/actions` 暂停或继续提交；暂停不停止已启动 Run。等待和中断释放批次名额，不自动重跑中断；连续三项失败暂停。启动前保存 starting 与已有运行编号，重启后对账，避免重复启动。批次文件在 dataRoot/work-item-batches；重启恢复待提交项，非终态执行仍遵循 runs 的中断/等待语义。验证见 tests/item-batches.test.ts 与 browser/workitem-decomposition-lifecycle.spec.ts。

工作项内组合入口：`GET /api/items/:id/workspace`返回ItemWorkspace（只读）；`POST .../workspace/actions`支持init/checkFlow/saveFlow/run/stop/resume/assistant/stopAssistant/saveUiProgram/publishDelivery/continueRecords/addInput/reviseInput/saveMethod。`POST /api/items/:id/uploads?name=...`接受原始文件body，返回完整工作空间。具体结构以shared/workitem-composition.ts和composition.ts为准。工作项Assistant接受conversationId并返回requestId/conversationId，状态从work.messages轮询；createConversation返回新增会话ID及workspace，未知或跨项ID拒绝；同一保存、准备与运行入口服务页面和工具，不新建命令总线。既有items/actions仍处理完成条件、结项及重开。

工作项workspace/actions增加checkWorkspace只读联合检查（definition/source可为未完成草案，runId必须明确），及childOutputs/previewChildOutput/selectChildOutputs接现有子项阶段交接。检查回执不是ItemWorkspace快照；前端主工作区不将其当作业务快照合并。保存/正式运行/发布继续走原入口与校验。


/api/works/:id?view=header只返回work的id/title/goal/updatedAt/archivedAt，供已打开入口恢复，完整方法快照及固定runIds读取仍维持原合同。工作项条件读取的具体依赖见work-items指南；未变化的304不能构造全工作区或执行任何模型。

## 唯一工作项入口（2026-10-30）

正式启动已从HTTP路由提取到work-items/execution.ts。普通actions、workspace/actions、Pi和批次直接调用runItem；工作项只有workId/inputBindings/deliveries/uiProgram，无内部HTTP自调用。OpenUI保存/发布/记录接续在composition.ts；旧ItemUiPlan/composition-ui已删除。prepare/check是只读，创建/输入修订/运行/发布/条件确认是明确动作。

默认API使用FLOWCRAFT_API_PORT（4331）、数据根FLOWCRAFT_DATA_ROOT；显式createApplication options.dataRoot优先且隔离测试模型目录。托管脚本须明确4321/data。不要连接托管端口作为测试。
