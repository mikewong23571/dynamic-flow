# 业务工作项

继承根与src/AGENTS。当前唯一流程见[OpenUI处理合同](../../../docs/workitem-openui-flow.md)，实施证据见[当前track](../../../conductor/tracks/overall-design-workitem-openui_20261030/documentation.md)。旧track的字段/通过记录不代表当前接口。

## 入口与责任

| 入口                                              | 责任                                                                              | 交接                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| index.ts/createWorkItems                          | 身份、私有Work、材料、条件、历史、结项重开、业务写入串行及正式运行关联            | FileStore、work、runs回调                                       |
| execution.ts/createItemExecution                  | prepare后启动正式Run、失败输入新commit补跑                                        | flow、runs、run-inputs；HTTP/Assistant/批次同用                 |
| composition.ts/createItemComposition              | 工作区读取、当前Definition/输入、原生OpenUI保存、固定交付、记录接续、公共方法复用 | 同源OpenUI库、work/flow、客户端                                 |
| prepare.ts、run-inputs.ts                         | 只读准备和精确输入解析                                                            | material/result/received/child-results/completion，不猜最新成果 |
| children.ts、source-scope.ts                      | 子项、范围、修订和祖先范围约束                                                    | 先校验合法候选再重开/提交；逐项部分成功                         |
| batch-runs.ts                                     | 冻结启动请求、并发窗口、暂停及在途观察/恢复                                       | 同一runItem，不是第二调度器                                     |
| workspace-check.ts                                | 定义/输入/原生程序/明确Run联合检查                                                | 只读，不执行模型或另一套图                                      |
| queries.ts、stage-inputs.ts、completion-inputs.ts | 分页摘要、后代阶段来源和固定完成依据                                              | 原始数据留服务器，列表不复制正文                                |

## 唯一数据合同

WorkItem只有workId、inputBindings、deliveries和可选uiProgram。创建即建立ownerItemId对应的私有Work；公共方法按固定版本call应用，单步骤选择保存为本项普通节点片段。没有workflowId/lastRunSelection、delivery单数、公共方法作者业务副本或ItemUiPlan兼容路径。

OpenUI source是唯一当前可写安排。程序历史只读；Delivery固定work/run/definition/output、uiProgramId和派生recordContract。rowKey来自保存程序，发布验证唯一非空编号；客户端仅提交交付/记录ID。标签改动不换记录身份，rowKey改变需新绑定ID。

received修订保留replacesId并更新所有当前绑定。失败输入补跑另存inputSource指原run/result/input端口/index，解析时重读并保留原sampleId；新Run.retrySource保留完整原方法/运行/版本。旧失败Run不改成功，成功实例不重跑；旧/新成功产物须显式选来源汇合成新正式交付。诊断preview不能发布或提交里程碑。

Run.completed不结项。条件依据、范围排除、子项完成及重开由明确业务动作保存。运行中的等待/中断/停止和业务状态分开；当前未决运行拒绝另起，不通过文本推断完成。

## 最小调用及错误

- POST /api/items创建身份和私有Work；GET /api/items/:id/workspace读取。
- workspace/actions的saveFlow、bindInputs、selectInputs、addInput/reviseInput、useMethod、run、continueFailedInputs、saveUiProgram、publishDelivery、continueRecords调用上述具体服务。
- 普通actions和workspace动作共享输入修订/执行函数，内部不通过app.request自调用HTTP。
- 写操作携带baseRevision；saveFlow带expectedDraftId，saveUiProgram带expectedProgramId。冲突不覆盖；错误code/issues交给页面或工具，不能只保留一段文本。
- 输入/候选/来源及重开确认在同一业务串行队列内先准备校验再写；不做跨文件事务平台。批量按真实已保存前缀返回回执。

## 存储与验证

业务记录保存在dataRoot/work-items，批次在work-item-batches；私有/公共Work与Run仍经files保存。数据重置只在明确交付任务执行，不用托管数据测试。

优先运行tests/workitem-unification.test.ts：创建唯一工作区、无效子项不改父项、跨入口修订、OpenUI真实发布及记录身份、嵌套失败补跑和精确成果汇合。其余范围/依据/生命周期测试按当前调用更新后回归。fixture不代表模型验收；浏览器/真实模型/视觉分别见track。

业务可见性纠偏：动态界面贯穿处理过程。read_inputs复用resolveItemInputs；read_children复用已有summary；read_output以本项明确Run和Definition读取阶段产物，与正式Delivery分开。Details/Metric/DataTable只组织真实数据，字段/标签由Assistant安排；现有Records/Report保留固定交付与业务动作。新验证入口tests/workitem-visibility.test.ts、tests/browser/workitem-visibility.spec.ts，实际模型质量与视觉边界见当前track。
