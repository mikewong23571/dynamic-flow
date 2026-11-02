# 工作项分治 track 独立设计审查

日期：2026-10-23。审查者：独立 subagent。

范围：读取本 track 的 spec、plan、research、implementation、acceptance 及前版设计；只读核对当前 records、work-items、run-inputs、HTTP 启动、runs、Results 和工作项页面源码。不修改应用，不运行功能/浏览器/模型测试。本文不是实施验收。

## 总体结论

低认知用户主线保留完整：不要求创建时选类型；拆出的子问题沿用明确材料；系统准备输入，用户只处理缺口；整体入口按问题找待办；检查已有依据后完成，不强迫每层再次运行汇总。

调研抓到了当前代码的实际约束，未把“已有类型/组件”冒充“已有交互”。分阶段大方向合理，规模阶段明确含历史数据、消费者兼容和真实操作次数。

有两个需要在实施前修正的阶段/接线缺口：Phase 1 结构性父项完成应当同时保存最小完成依据引用；Phase 3 自动建立部分失败后的实际重试入口不能直接复用现有 preview 重试。另有两个应在实施合同中明确的验收口径。修正均局部，不需要新增平台。

## 源码事实核对

| 重点 | 当前源码事实 | track 判断 |
| --- | --- | --- |
| 纯 JSON 启动 | work-items/index.ts `launch` 在调用 HTTP 回调前检查 `item.materials.length`；HTTP 回调才执行 `prepareItemInputs` | 正确。仅放开跨项来源仍不能启动；需要区分显式选择与旧文本默认 |
| 父子材料 M01 | run-inputs.ts 的 materials Map 用裸 id；选定 output.materialIds 从源 Run.workItem.materials 取文本，并按相同 id 检查冲突 | 正确。命名空间与冻结 InputItem.materialIds 必须一起改，不能只改变展示标题 |
| 精确 port/index | OutputReference 已精确；CriterionReference、RunFocus/InspectedArtifact 仍为 result 粒度；WorkItemDetail.useArtifact('run') 枚举整个 result 所有输出 | 正确。需要同时修改保存、选择动作、来源跳转，不仅扩类型 |
| 完成事件汇总 | complete 只复制 criteria；重开清 met，保留历史；当前没有结构性父项及 childCompletions | 正确。事件引用适合作为稳定汇总输入，但保存时机见 R1 |
| 列表分页消费者 | list 对全部项调用 view；Results.tsx GET /api/items 后筛选；WorkItems 前端 slice | 正确。不能只给 WorkItems 做服务器分页；Results 需要指定关联摘要 |
| 同方法运行 | runs.owner 用 item:id，不同工作项允许共享同一方法并发 | 正确。无需复制方法；这也意味着批量 HTTP 请求结束不代表 Run 结束 |
| 节点内并发 | runs 对节点 batches 按 node.concurrency 启 worker，并允许可执行节点并行 | track 已要求测真实并发；需区分 Run 窗口和 Agent 峰值，见 N2 |
| 自动节点重试 | runs.retry 创建 node 范围的新 preview Run；resume 只允许 interrupted 原 Run | 原有重试不是新的业务副作用重试路径，见 R2 |

## R1 — Phase 1 开放结构性父项结项，却到 Phase 4 才固定子项依据

严重性：实施前需要修正的阶段断点。

具体例子：Phase 1 中，父项没有独立文字条件，A、B 已完成，用户按设计确认父项完成。若沿用旧 completed 保存逻辑，只留下空 criteria。后来 B 重开并得到新结论。到 Phase 4 做汇总时，无法从父项旧完成事件判断当时认可的是 B 哪一次完成记录；按当前 B 查找会改写历史含义。

源码依据：work-items/index.ts `complete` 保存 `{criteria: structuredClone(item.criteria)}`；当前 `ItemHistory` 没有 childCompletions。plan 的 Phase 1 已开启结构性父项完成，Phase 4 才补完整快照。

最小修正：Phase 1 允许结构性父项结项时，同时保存最小 childCompletions（子项 id + 当次完成历史 id）与当次确认范围的必要摘要。Phase 4 再实现完整成果解析、汇总输入和界面，不需要提前完成汇总功能。

最小验收：Phase 1 完成父项→重开 B→再次完成 B；父项旧完成记录仍能明确指向 B 的第一次完成。不得通过事后扫描最新完成记录“补全”旧事件。

## R2 — 自动建立部分失败，没有对应现有 runtime 的可提交重试入口

严重性：Phase 3 用户路线闭环前需要修正。

具体例子：create-items 已成功建立 A，保存 B 失败。页面显示 Run 失败，用户点击现有“重试失败输入”。当前 runs.retry 生成 node/preview；新节点合同明确该模式不写工作项。因此重试成功也不会建立 B。若改为重跑整个流程，上游产生新候选来源，无稳定 trackingKey 时又可能建立重复 A。

源码依据：runs/index.ts `retry` 固定 `scope: {nodeId}`、`effectMode: 'preview'`；`resume` 只处理中断。implementation 第 5 节限制新节点 full/commit，但未明确失败后的业务动作。

最小修正：在已有候选清单/建立回执上提供“重试未建立项”，沿用原固定候选来源及 candidateId，调用同一个 children 建立动作，成功项直接关联。原 Run 仍保留失败事实，后续业务操作留自己的历史和清单反馈。通用运行重试继续保持 preview，不为一个节点扩大所有重试的业务写入权限。

或者选择明确的另一条同等简单路线，但文档必须说出用户点哪里、输入来自哪里、为什么不会重建 A。

最小验收：两项中第二项保存失败→清单点击重试→仅建立 B；A 的 id 不变；原 Run 失败与后续补建事实均可见。没有 trackingKey 也应成立，因为本动作仍使用原来源。

## N1 — Results 的关联摘要需要保住跨方法的“第几次推进”

严重性：合同与回归补充，不需新模块。

Results 当前不只取业务标题和状态，还取 item.runs；result-overview-model.ts `runLabel` 在跨方法全部 runs 中 findIndex，计算第几次推进。仅返回 id/title/status 的 ids 摘要会使标签降级或错把某方法内第 1 次当业务第 4 次。

最小补充：关联摘要为当前请求的 run 返回推进序号，或保留轻量 ItemRunRef 顺序；不返回运行正文。验收用一个工作项跨两个方法至少四次运行，切服务端分页后标题、状态及轮次均正确，关联项不因列表页码漏掉。

## N2 — 批次窗口的上限应准确命名，不能等同模型请求上限

严重性：容量口径补充。

运行窗口为 N，只能约束本批同时处于运行生命周期的 Run。一个 Run 内可有多个并行 Agent 节点，每节点又可以 concurrency > 1。因此“最多 N 个 Run”不等于“最多 N 个模型请求”。当前 runtime 源码支持这种情况。

最小补充：首版明确定义窗口为本批活动 Run 数，等待/停止中如何占位由一个固定规则说明；记录实际 Agent 调用峰值及所用方法的并行设置。测试包含不止一个模型执行单元的 Run，防止 HTTP 窗口或单节点样例掩盖放大。若需要限制模型峰值，再用证据决定最小限制；本 track 不必预建全局资源调度器，也不要承诺它尚未提供的全应用模型硬上限。

## 不应扩大的部分

- 无需增加聚合/执行 role、第二套事项实体、多父归属或通用任务依赖图。
- 来源精确和确认记录属于系统责任，不应新增用户必须填写的 runId、port/index、completionHistoryId 表单。
- 不需要为 1,000 项先迁数据库；先消除同一方法完整快照重复读取，再按真实数据决定最小摘要索引。
- 用户批量启动后仍能看到未启动/缺输入，首版不承诺后台持久排队；必须保留这种明确边界。
- 手工分治、清单建立、自动建立、汇总和规模可以分阶段交付，但每阶段新产生的数据应保有下一阶段无法事后重建的来源事实。

## 本轮审查状态

上述 R1/R2 已发给 track 作者；由作者更新 plan/implementation/acceptance，审查者不修改这些文件。未执行应用测试，未改变真实数据。本报告初稿结论为“局部修正后可进入实施”，不是“功能已经闭环”。

## 作者处理记录

R1已将最小childCompletions保存前移Phase1，并加入父完成/B重开再完成的历史验证。R2已明确原候选清单“重试未建立项”业务动作，原Run失败保留、通用runtime retry不变。N1补跨方法推进序号摘要与4轮测试；N2明确未终结Run窗口及等待/中断占位，Agent峰值另测。上述已同步plan/implementation/acceptance/research，仅为文档修正，尚未实施。

## 后续规则变更说明

本报告及先前作者处理记录中的“未终结Run窗口、等待/中断占位”为历史方案，已由后续[逻辑修订](logic-review-fixes.md)取代：等待/中断释放新启动名额，既有恢复优先并重算活动数，达到启动阈值时暂缓新提交；阈值不承诺硬并发上限。此前R1/R2与跨方法轮次修正继续有效。
