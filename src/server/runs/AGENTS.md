# 执行、停止与局部重试

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

顺序执行先服务小样本。SDK 中止与外部端点实际停止计算不同；必须测真实取消行为，不承诺尚未验证的时序或并发能力。真实任务若无法完成，再调整支持范围。本清单不穷尽未知。

## 当前交接与证据

`createRuns(files, executeNode)` 直接组合文件与 Pi 节点函数，提供 start/stop/retry/wait；reserve/release 仅用于同工作比较链占用，不是通用队列。tests/runs.test.ts 验证失败保留与单项重试、停止迟到响应、空分支与汇合、固定版本/输入及工具身份。HTTP 接线见 server/index.ts，真实模型和浏览器验收单列，测试替身不代表模型质量。

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
