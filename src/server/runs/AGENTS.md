# 执行、停止与局部重试

## 快速定位

- `index.ts` → `createRuns(files, executeNode, hooks)`：DAG 就绪调度、固定输入与来源、实例与活动记录、停止/重试、等待/事件/恢复；底部返回对象是当前 RunService。
- `collections.ts`：具名 merge/collect/join 的纯计算和参与行来源；表达式求值复用 flow/expressions.ts，schema 复用 flow/schema.ts。
- executeNode 由入口传入（默认 assistant.executeNode），onMilestone 接 work-items，onFinish 接当前导入收尾；本模块不自行组装 Pi 或业务工作项服务。
- 验证入口：`tests/runs.test.ts`、`tests/lifecycle-runtime.test.ts`、`tests/lifecycle-process.test.ts`；集合/表达式另跑 multi-input.test.ts / functional-ir.test.ts。测试与真实模型证据分开。
- 有限并发、持久等待和显式 resume 已实现；不要把旧“始终顺序、重启只能另起运行”的推演当作当前约束。

适用本目录，继承上层约定。有限节点执行已实现；产品级验收见整个应用 track。

## 职责与子问题

指定版本与输入如何真实完成一次运行，并如实处理部分完成、失败和停止？负责输入固定、依赖执行、逐项/分支/合并、实例记录、停止和重试。故事：C1–C3、D1、E2、F2、F3。

## 目标

- 全量、单节点、比较两侧与续做使用同一执行路径，只运行明确范围。
- 空分支能结束，单样本失败保留其它成果但阻止错误汇总。
- 调用前后检查停止；迟到响应不覆盖终态；重试创建新的 Run。
- 实例与活动带 run/definition/node/instance 身份和输入来源。

## 非目标

不写 Agent loop，不建通用调度器/队列/分布式引擎，不做隐式缓存或任意调用栈恢复。

## 接口与依赖

提供 start / stop / retry / wait，以及 reserve/release/isBusy 供比较链协调；比较复用同一个 start。Agent 调用传递固定上下文、停止信号和活动回调。

依赖 flow 校验、assistant.executeNode、files；普通转换用 JS。无额外工作流框架。参考 [伪代码](../../../spike/src/server/runs.pseudo.md)。

## 验收与证据

下文编号只是查阅索引：P 表示具体测试场景，T 表示完整用户验收路线；含义见 [术语与编号](../../../docs/glossary.md)。

- [x] 实例不复制职责节点；空集合零调用；编辑或换选择不影响冻结输入（场景 P03/P06/P07/P14）。
- [x] 停止/失败/完成交错正确，保留成果，迟到结果不能继续下游；重试只有失败输入（场景 P08/P09）。
- [x] 比较共用执行路径，不重复启动；停止基线后不执行候选（场景 P27/P28）。
- [x] 真实 Pi 工具活动归属准确；与 files/client 核对进度和保存结果（场景 P30）。

## 假设与未知

有限并发与等待恢复的当前合同见下文。SDK 中止与外部端点实际停止计算不同；必须测真实取消行为，不承诺尚未验证的时序或并发能力。真实任务若无法完成，再调整支持范围。本清单不穷尽未知。

## 当前交接与证据

`createRuns(files, executeNode, hooks)` 直接组合文件、节点执行函数与生命周期回调，提供 start/stop/retry/wait；reserve/release 仅用于同工作比较链占用，不是通用队列。tests/runs.test.ts 验证失败保留与单项重试、停止迟到响应、空分支与汇合、固定版本/输入及工具身份。HTTP 接线见 server/index.ts，真实模型和浏览器验收单列，测试替身不代表模型质量。

产品级验证与边界见 [本轮验收证据](../../../conductor/tracks/full-application_20260920/evidence.md)。

## 持久业务推进（2026-09-20，新基线）

H3–H8 取代上文“始终顺序/重启只能另起重试”的限制。Run 保存 workItem 输入快照、effectMode、waits、signals 和实例结果。`createRuns(files, executeNode, hooks)` 新增 `onMilestone(workId,run,node,inputs)`；仅工作项 full/commit 调用。回调按 runId+nodeId 去重；未接线时正式里程碑明确失败。普通预览、节点试运行、比较不提交业务进展；预览等待透传并在 event 端口标记 preview。

`signal(workId,runId,{id,name,payload?})` 只释放匹配待定等待；相同事件重复无效果、冲突 ID 报错。event 端口包含事件名称、payload、接收时间，超时标记 timer。`recover()` 在 files.onServerStart 后恢复等待和到期任务；`resume()` 显式继续 interrupted。成功实例从检查点恢复，不再请求外部模型。不确定调用可能再次执行，不承诺外部副作用恰好一次。`close()` 取消本进程计时与调度，保留持久状态。

file 来源节点在 runNode 开头短路：校验 upload 存在后产出文件名项（不调模型），文件缺失如实失败。

`onFinish(workId, run)` 在运行进入终态后调用（completed/failed/cancelled，waiting 不算），供系统流程收尾登记（当前用于数据剖析导入的洞见/材料登记与消息更新）；回调错误只记录日志，不改写运行状态。

独立就绪节点最多 4 个并行，逐项 concurrency 默认 1、允许 1–8；输出按输入顺序组合。operation map 保留返回数组为一个值，flatMap 明确展开一层，aggregate 全量调用一次；旧 function 未设 operation 的定义维持历史逐输入透传语义。inputSchema/expectedOutput 是单次调用契约，经 Ajv 实际校验；失败实例不出结果，依赖它的汇总阻断。执行上下文使用 workItem 快照材料，普通方法运行继续兼容 Work 材料。

域内证据：tests/lifecycle-runtime.test.ts 覆盖真实文件重开、受控时钟离线跨45天与45天长等待分段计时、显式恢复不重跑成功调用、迟到事件、预览、并发顺序/来源、schema 错误。模型为测试替身；真实 HTTP/进程/浏览器由 track 验收补充。

局部 retry 显式继承旧 Run.workItem 冻结快照，并强制 preview。所选结果续做/比较在未显式传入 workItem 时，由每个 sourceResultIds 的原 Run 解析快照：必须同工作项同 revision；与另一工作项、另一修订或无结果来源的方法材料混合时拒绝。未知结果引用也明确报错。不能仅凭 M01 编号从方法示例中猜材料；推导来的上下文不授予业务提交，仍为 preview。


## 函数式节点接线（2026-09-20）

functionName=expression 只走显式 operation 调用路径，不能落入旧函数透传分支。map/flatMap 的 input 变量为单个输入值，aggregate 为按输入顺序组合的整批数组；表达式内部 flatMap 只改变值数组，节点 operation=flatMap 才展开为多个端口项。执行前后继续用 inputSchema/expectedOutput 校验；表达式错误、解构失败、未穷尽 match、除零或 schema 失败记录到实例，且不向下游传播失败输出。

原有 InputItem 包装保留顺序与来源：map 来源是对应输入，aggregate 来源是参与本次调用的全部输入，flatMap 每个子项继承该调用的来源。表达式内部 filter 不声称更精细的逐字段来源推导。旧 identity/select-fields/merge 未指定 operation 时继续保持历史行为。

`tests/functional-ir.test.ts` 通过真实文件保存、重开、执行验证表达式的 aggregate/map/flatMap、来源与顺序、草稿拒跑、schema 阻断及旧定义兼容；`tests/runs.test.ts` 与 `tests/lifecycle-runtime.test.ts` 为原有调度和生命周期回归。

## 多路汇合、具名收集与按键关联（2026-09-20）

`collections.ts` 是仅处理有限 JSON 数组的纯集合运算：新 merge 按 inputNames 声明顺序连接每路项；collect 返回一项具名数组对象（空路仍是 []）；join 按左顺序与右路原顺序配对，right/full 最后追加右缺配项。join 只接受自身字段路径中的 string/finite number/boolean 键，类型严格区分；空路径读取整值。null/缺失/数组/对象明确失败。duplicates=all 全部配对，error 检查两侧重复，即使对面为空。

集合调用先校验具名输入对象、再校验整体输出。新 merge/join 校验整个数组后分发逐项输出，collect 保留对象单项。沿用 DAG 就绪/失败阻断、固定版本/上下文、节点 preview/retry 路径，不建额外调度器。

每个输出的 materialIds 仅来自实际参与行；sourceResultIds 为当前集合实例 ID 加参与行的直接来源 ID。一次集合实例的 input 仍包含全部输入，不能宣称仅凭当前实例 ID 可逆推每行来源；输出包装的显式上游 ID 用于精确直接来源。重复键会自然令同一源行参与多个输出，不强制去重业务行。

## 局部展开与有限迭代

Dynamic 先创建 purpose=planning 实例，调用原 executeNode；提案经 `flow/expansion.ts` 与 flow 统一校验，保存到 Run.expansions 后才调度子图。子图只收 input、输出 output，最多 20 节点，所有节点须有合同并关联最终输出，不允许再 Dynamic。shared/expansion 将节点前缀为原节点 ID + `/`，原节点成为输出边界；等待、停止、来源、schema 与恢复继续走原 DAG 调度。恢复读取已保存展开，不重做成功规划。

Agent/普通函数的 operation=map 可配 repeat（max 1–10，until 可选纯表达式）。每轮输出作为下一轮输入，实例有 iteration；中间轮标 intermediate，不进入下游。until 的 input 是本轮单值输出，必须为 boolean；达到上限仍 false 失败并保留末轮产物。恢复重用成功轮次，只重做未确定轮次。单节点试运行也可展开；生成子步骤暂不直接局部重试，先将成功展开固化或从动态位置重跑。测试 semantic-workflow.test.ts 使用真实临时文件，模型边界替身。


## 工作项报告交接

普通 Agent 的 NodeExecution 传递实际 Run.scope/effectMode，full/commit 工作项由 assistant 提供受限 report_progress 工具，入口直接连接 items.reportProgress。动态规划不提供报告，展开后普通子节点继续使用同一执行路径和绑定身份。带 comparisonId 的运行强制 preview，即使调用方请求 commit；旧单节点调用与试运行不授予业务报告；明确正式单步见下节。停止前后的工具信号与 work-items 对当前 Run/实例复查共同拒绝迟到写入，不改调度/恢复算法。`tests/workitem-progress.test.ts` 覆盖实际 Pi 替身、并行展开、两项共享方法、输出失败、比较与预览边界。

## 显式正式单步与原始样本

工作项准备入口可为静态普通Agent/Function设置内部commitScope=node，连同明确workItem/effectMode才形成node/commit；普通旧node调用不因带工作项而获得正式语义。里程碑仍full/commit，比较/retry强制preview。Run保存inputSources跨方法直接引用和sampleSource原始实例选择；retry保留固定来源。

`work/run-samples.ts`读取源Run真实result.input并冻结业务材料，用于原始实例比较与试运行；不可把输出或浏览器传入值当原始输入。对应trials固定两侧同一Inputs和WorkItem上下文，不写回Work样例。

节点输出异常时保留executeNode写入的rawOutput：普通/展开后节点执行与dynamic规划两条调用路径均写入失败NodeResult；通过现有快照API读取，不把该原文当有效输出或工具活动。成功产物仍以outputs为准。

## 明确建立子项（2026-10-23）

`create-items` 是固定整批处理的 的 input→output 业务节点。每个输入值是一份候选容器；仅正式工作项 full/commit 且非比较调用 `RunHooks.onCreateItems(parentId, source, signal)`，其余路径只输出 preview/candidates，不建立工作项，静态正式单步仍只支持普通 Agent/Function。

source 为 `CandidateSource(kind:node-input, workId/runId/resultId/port/index)`，读取首次保存的 `NodeResult.input`；恢复复用该 resultId 并比较输入，不由 sourceResultIds 猜端口。每容器输出 `{source,receipts}`，部分失败保存成功回执并将节点失败；hook级失败仍保留固定清单入口。停止后不执行下一容器，closed 的迟到 hook 不覆盖恢复结果。普通 retry 仍 preview；业务补建走 work-items 同源动作，不改旧失败 Run。

`tests/create-items-runtime.test.ts` 验证直接输入、多容器身份、preview/比较/停止、恢复与回执；`tests/create-items-integration.test.ts` 连真实HTTP hook与工作项文件，模型为显式替身。真实 Pi 小样和前端验收见 feature-workitem-decomposition track。


普通 aggregate 节点的输出仅按 expectedOutput 校验；Definition.summaryOutput 是可选展示绑定，不追加固定schema。标准摘要卡片只在 isRunResultSummary 成立时显示，其它合法值保留普通原值阅读。失败沿用真实节点失败和已有成果保留，不补造报告，也不更新业务完成状态。相关验证 tests/result-summary.test.ts、cve-v2.test.ts。


## 固定方法组合调用（2026-10-28）

`kind:call` 仍走本模块同一 schedule/perform。call 保存 workId/definitionId/inputNames/outputNames；aggregate 整批调用一次，map 按 eachPort 单项派发、其余端口广播。启动通过 flow/calls.ts 解析固定引用与接口、拒绝循环；不递归公共 start，也不另建调度器。NodeResult.call 先保存真实子 Run 引用再派发，Run.parentCall 记录调用血缘。调用输出按固定 Definition.outputs 投射具名端口；InputItem.source 保存子方法精确生产位置，本地 sourceResultIds 指向父调用结果。

子调用继承 workItem/effectMode/comparison；本次材料按实际 batch.materialIds 筛选并冻结，普通方法调用用 Run.materials，不借用被调用方法样例。缺失材料、端口或输入契约明确失败。父停止沿实际调用树传播，不取消独立业务子项；正常关闭后未确定实例由现有文件恢复和显式 resume 处理。

子等待以 RunWait.source 投影到父等待，父 signal 转交真实等待执行；父 resume 继续原子 Run，成功实例不重复运行。父等待不占据子调用的执行名额。失败实例保留成功调用并阻断要求成功的下游；尚未提供任意部分失败自动汇总。`tests/composition-runtime.test.ts` 使用真实临时文件验证多端口/广播、来源、固定版本、递归与缺失拒绝、停止、等待重开、显式恢复、材料范围和多层调用。


固定call的子Run.inputSources仅来自本次实际映射/广播输入及对应父结果，不复制父Run的全部来源。逐项调用的另一条输入来源不能混入当前子Run；旧无逐条source的输入仅按sourceResultIds匹配已有来源回溯。

invocation.ts集中原有map/flatMap/aggregate批次及schema参数组装，runtime与工作项方案检查共用。它只构造调用参数，不执行节点；普通map/flatMap为单值、aggregate为值数组，collection/call为具名端口数组对象。唯一输出分发、节点执行、正式副作用与恢复仍在原运行器。


逐项call的invocationBatches先将eachPort替换为本条，再structuredClone调用包；其余端口按现有语义广播并隔离。不能先复制整批再替换，否则N条输入会造成N²拷贝，也会拖慢只读检查。检查器与runtime仍共用同一函数。验证见workspace-performance.test.ts的复制次数/独立调用包与composition-runtime。

## 唯一计算及冻结上下文

FlowNode不再有mode；普通Agent/Function必须声明map/flatMap/aggregate，call声明map或aggregate，集合与控制节点由kind/functionName固定整批。shared/node-ports.nodeOperation是调用单元的唯一读取；merge/collect必须明确inputNames，无隐含left/right兼容。原resultOutput专用业务schema已移出内核，普通输出只按明确schema验证。

所有Run在start保存materials；NodeExecution和子call只读取本轮冻结材料，后续Work补材料不倒灌。实例/引用存在性使用files.select，固定call接口每Run复用校验，不逐实例复制整个Work。正式失败补跑由工作项服务新建commit Run并显式接续成功来源；此模块retry是明确的诊断preview，不能代替正式交付。

验证：runtime-mechanisms.test覆盖schema编译生命周期、业务正文不猜字段及5实例不重复读取Work；composition-runtime/lifecycle-runtime覆盖固定call、广播、等待、停止、恢复及成功实例保留。不要把局部通过当浏览器或真实模型验收。
