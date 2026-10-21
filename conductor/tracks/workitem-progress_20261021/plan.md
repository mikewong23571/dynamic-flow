# 实施计划：工作项进度总览与单项推进状态

状态：2026-10-21 用户指示“闭环”，开始实施。先完成可观察的纵向路径，不提前建设通用机制。执行遵循 [项目 workflow](../../workflow.md)，核心业务边界先写有意义的失败测试。

## Phase 1：整体数量与筛选闭环

- [~] Task: 在工作项/生命周期测试（可就近新增 `tests/workitem-progress.test.ts`）先补汇总口径/pending 筛选测试，确认出现预期失败；覆盖五种状态、结项重开、搜索与状态过滤前的全局统计。
- [ ] Task: 扩展共享响应及 work-items.list，在同批工作项视图上计算 summary 后筛选；保持现有 total 语义，不保存独立计数。
- [ ] Task: 阅读 `src/client/DESIGN-NOTES.md`、控件 README 与同类管理页；在现有工作项页接入紧凑数量汇总、选中态与点击筛选，保留搜索和稳定行序。
- [ ] Task: 验证空/加载/读取失败/零匹配；10 项示例数量与筛选一致。运行定向服务/HTTP 测试与类型检查，浏览器实际操作汇总入口，记录阶段证据。

## Phase 2：单项当前状态可理解

- [ ] Task: 先补工作项视图测试，覆盖无运行、本轮成功未结项、条件齐全待结项、失败/中断、真实等待、并行节点及动态展开。
- [ ] Task: 复用固定定义与 Run/展开记录派生活动节点摘要；展示业务阶段和运行状态，保持查询只读、心跳不改变 progressAt。
- [ ] Task: 调整详情首屏，集中呈现阶段、当前执行、最近成果、等待/错误与下一步提示；完成条件只显示实际确认数，来源运行继续按需打开。
- [ ] Task: 用真实数据路径验证列表与详情一致、缺失字段和长内容可读；运行定向测试及类型检查，记录阶段证据。

## Phase 3：进展报告保存与 HTTP 合同

- [ ] Task: 先补报告服务测试：合法报告、材料引用、重复 ID、不同内容冲突、旧 revision、错误运行来源、结项拒绝、保存失败；新字段缺失的旧文件可读。
- [ ] Task: 在 WorkItem 上增加可选 nextAction/blocker，在业务历史保存报告完整内容与来源；复用现有串行修改与原子保存，不建立独立进展存储。
- [ ] Task: 实现 reportProgress 与现有 actions 路由；空闲项明确阻碍派生“需处理”，活动运行/等待/执行错误按规格优先显示。清理新运行、方法切换、重开和里程碑替代时失效的下一步/阻碍。
- [ ] Task: 用真实临时文件与 HTTP 联测确认保存后 GET/列表/汇总一致、重复不刷 progressAt、重开服务可读；无报告时不从聊天推断。
- [ ] Task: 页面展示下一步、业务阻碍、报告来源及历史；运行服务/HTTP 定向测试与类型检查，记录阶段证据。

## Phase 4：正式执行 Agent 的报告闭环

- [ ] Task: 在 `tests/assistant.test.ts` 与生命周期集成测试先验证工具输入、服务端身份绑定及保存回调；覆盖普通正式执行可用，作者/规划/preview/试运行/比较不可用。
- [ ] Task: 应用入口注入直接进展回调，普通正式执行 Agent 增加 report_progress；执行身份从上下文固定，复用 toolCallId 与历史去重，不让模型自行填写目标身份。
- [ ] Task: 检查停止信号及当前正式 Run，拒绝结束/取消/旧运行的迟到工具写入；不改变现有恢复算法，不声称工具与远端外部动作恰好一次。
- [ ] Task: 用不含 milestone 的真实运行链路验证工具 → work-items → 文件 → HTTP → 页面；模型边界先用明确替身，分别覆盖报告后成功和报告后节点输出失败。
- [ ] Task: 使用现有 models.toml 中实际可用的模型完成一次无里程碑报告验证，记录端点/模型、真实工具行为与限制，隐藏密钥；不能调用时明确记为未测，不能用替身记录替代。
- [ ] Task: 验证展开后的普通节点可报告、并行报告历史均保留、两个工作项共用方法不串内容；运行相关定向测试与类型检查，记录阶段证据。

## Phase 5：浏览器验收、回归与文档

- [ ] Task: 在现有 `tests/browser/workitems.spec.ts` 或就近新增 `workitem-progress.spec.ts` 覆盖总览 → 筛选 → 详情 → 报告可见 → 条件确认 → 结项 → 重开的完整用户路径。
- [ ] Task: 浏览器新用例使用临时数据和私有服务，复用 semantic-workflow 浏览器用例的隔离方式；不向当前用户 data 写测试夹具，不清空已有数据。
- [ ] Task: 实际检查 1440×900 与 1024×768 截图，覆盖加载/空/错误/等待/失败/长文本与零匹配；确认轮询不自动重排、不覆盖阅读与编辑上下文。
- [ ] Task: 运行下列相关检查，依据实际变更追加最小必要回归；通过后不无目的扩大测试范围。
- [ ] Task: 同步 work-items、assistant、runs（若接口变化）、shared、client、server 与 tests 最近的 AGENTS；更新工作项故事、当前设计、实施地图和术语中的真实合同，不重写历史 track。
- [ ] Task: evidence 分别记录模块、真实文件/HTTP/运行、Pi 替身、真实模型、浏览器与视觉未测项；验证满足后才更新 metadata/注册表完成状态。

建议验证命令（实施时按受影响路径选择）：

```sh
pnpm exec tsx --test tests/work-items.test.ts tests/lifecycle-integration.test.ts tests/assistant.test.ts
pnpm exec tsx --test tests/lifecycle-runtime.test.ts tests/lifecycle-process.test.ts tests/semantic-workflow.test.ts
pnpm typecheck:app
pnpm format:check:app
pnpm build
pnpm test:browser tests/browser/workitem-progress.spec.ts
```

最后一条在新增该用例后执行；如果扩展现有用例，则改用 `tests/browser/workitems.spec.ts`。既有浏览器用例可能复用 4320/4321 并写入该服务数据，执行前先核对 fixture 与隔离方式。

## 实施顺序与范围控制

每阶段先完成相关用户路径并验证，再进入下一阶段；Phase 1 可以单独呈现总览，但不能以统计卡片完成宣称整个 track 已完成。Phase 3/4 的进展反馈是本 track 的必要部分。

不增加额外状态表、报告基础设施或通用 Agent 协议。若出现无法由现有工作项、历史、Run 和直接回调表达的具体反例，记录输入、失效假设、影响与最小验证，再修改本规格。
