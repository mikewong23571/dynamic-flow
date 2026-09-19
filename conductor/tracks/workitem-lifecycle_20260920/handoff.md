# 模块最小交接

共享类型已在 src/shared/records.ts，扩展字段保持旧定义可读。与当前故事冲突的旧“始终顺序/重启只中断”限制由本轮授权替代。

## Runtime / Flow（运行器实现者）

改动域：server/runs、server/flow、server/files（恢复状态处理）、新 server/flow/schema.ts、相关 tests；shared 中仅必要类型修正并通知根任务。根任务负责 server/index.ts、assistant 接入、work-items 模块；前端实现者负责 client。

createRuns(files, executeNode, hooks?)：hooks.onMilestone(workId, run, node, inputs): Promise<void>；仅 workItem 且 effectMode=commit 且 scope=full 才调用。里程碑节点输出透传输入；根任务用 runId+nodeId 去重存业务历史。若先提交工作项后进程退出，恢复同节点回调允许再次调用，由去重保障一次进展记录。

新增 resume(workId,runId)、signal(workId,runId,{id,name,payload?})、recover()、close()。close 清除计时器并停止调度，用于测试/服务关闭，不删除持久状态。signal 必须仅匹配 pending wait.event，重复 id 相同消息无重复效果，冲突重用 id 报错。wait 完成后透传输入到 output，事件 payload 存 Run.signals 并可通过 wait 的 event 输出端口给下游（来源关联到等待结果）。超时 event 端口包含明确 timer 类型值。多个等待不阻止其它就绪独立节点。

等待和完成节点结果保存在 Run。recover 重新调度等待及到期任务；主动外部执行被重启打断先 interrupted，显式 resume 只重做未完成节点/实例，保留已完成结果。不要重跑已确认成功实例。停止等待阻止迟到触发。待运行节点与逐项实例有限并发，保留输入顺序；默认并发 1，可配置 1–8。同工作项最多一个活跃/等待运行；不同工作项共用方法可并行。旧 reserve/trials 行为保持。

operation 是执行组合 map/flatMap/aggregate，缺省从 each/all 适配。map 的数组结果保留嵌套，flatMap 明确展开，aggregate 一次处理全量。inputSchema/expectedOutput 描述单次调用输入值/返回值（map 是 T/R，aggregate 是 T[]/R，flatMap 是 T/R[]），执行前后用 Ajv 校验。普通函数和 Agent 都走实际结果检查；静态连接只检查可确定的不相容情况，不能冒充完整 JSON Schema 子类型证明。

## WorkItems / HTTP（根任务）

独立目录 data/work-items/<id>.json。Work 作为方法工作空间保留；WorkItem 通过 workflowId 选择方法，跨方法历史以 ItemRunRef 保存。业务状态 open/completed，waiting/running/attention 由最新运行派生到 effectiveStatus，不把运行心跳作为 progressAt。

HTTP：

- GET /api/items?query=&status= ：WorkItemPage；GET /api/items/:id：WorkItemView。
- POST /api/items ：CreateWorkItem → WorkItemView。
- POST /api/items/:id/actions：{action,...} → WorkItemView。
  - addEvidence {materials:string[]}；criteria {criteria:CompletionCriterion[]}；complete；reopen {reason}；method {workflowId}。
  - run {definitionId?:string}：缺省已采用/草稿版本；只接受该方法所属版本，冻结工作项快照，commit full。
  - signal {id,name,payload?}：发送给该工作项的当前等待运行。
  - resume；stop：目标为最新运行。
- GET /api/works 继续是方法列表；既有 work API 保留。

若有等待/运行/中断未决运行，拒绝新 run 或 method，要求继续或停止；criteria/补证据允许但不倒灌固定运行。未全部满足且无依据不能 complete，活跃/等待时也不能结项。runtime 回调仅写阶段、摘要和证据关联，不自动 complete。

## Client（前端实现者）

新增工作项总览及详情组件，复用暗色控件。侧栏区分“工作项”和“处理方法”（旧所有工作可兼容名称以保持测试）。总览搜索/状态；创建表单选择方法、业务编号/标题/目标/完成条件/材料。详情阶段、摘要、等待原因/截止、独立运行状态、材料/历史、条件勾选与依据、补证据、运行/继续/停止/发送事件、换方法、结项/重开。请求轮询只读 API，不依赖 SSE 中包含 items。

现有流程编辑支持等待/里程碑、operation/并发/输入输出 schema。节点卡只显示类型/名称/必要摘要，详情放 Inspector。wait 输出端口 output/event；milestone 透传 input/output。工作项进入运行详情时通过已有 workId 打开方法，并选定 runId。工作项 UI 不写硬编码业务结论。

## 错误与验收

API 保持 {error:string}；错误保留表单值。模块开发者跑自己改动域测试，根任务完成真实接线、浏览器和进程重启。新逻辑尽量测试先行，不能用固定成功模拟替代实际等待和恢复。

## 最终联测修订

事件 ID 的幂等范围为整个工作项（包括跨方法历史），不能仅在单个 Run 内去重。items.signal 串行查历史后调用 runs.signal。局部 retry、结果续做和比较保留来源 Run 冻结的工作项上下文且 effectMode=preview；不同工作项/修订或方法样本混合时明确拒绝。历史完成条件依据保存在 ItemHistory.criteria，客户端可展开当时快照。
