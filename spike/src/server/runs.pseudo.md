# 节点执行（伪代码，不可运行）

对应 C1–C3、D1、E2、F2/F3。全量运行、试验、失败重试与续做共用这里。

```text
start(workId, definitionId, scope, inputs):
  读取指定不可变定义；flow.validateForRun
  files.change 内检查：本工作没有 queued/running/stopping 运行或正在比较
  复制输入值及来源，创建 queued Run；保存成功才返回 runId
  后台 execute(runId)；同工作第二次点击返回“正在执行，请等待或停止”
  // 不排队，不并行运行多个流程。不同草稿编辑不受此限制。

execute(runId):
  取冻结的定义与输入；标记 running
  按依赖顺序遍历 scope 中节点：
    若收到停止请求：退出，不启动下一节点
    若上游失败/blocked：标记 blocked，不调用
    获取本轮输入；单节点 scope 只取 run.inputs
    branch：按有限字段条件分流，保存 match/rest，包括空数组
    each：依输入顺序逐项处理，每个实例前后检查停止
      记录完整输入、输出、状态；某项失败仍继续其它独立输入
      只要某项失败节点就 failed，下游不得用半份集合汇总
      空数组直接 completed，不调用模型
    all：完整端口输入一次传入；merge 按 left、right 合并
    每项结果保存之后才更新进度；成功输出保留 sampleId 和所有来源
  有 stopRequested -> cancelled；否则有失败/blocked -> failed；否则 completed
  在同一个 files.change 中判定最终状态；终态不被迟到回调覆盖

callNode(node, inputs, stopSignal):
  调用前检查 stopSignal
  先保存 status=running 的实例记录及固定输入，再开始调用
  工具活动与最终输出更新这条实例记录，不另外造重复结果
  agent -> assistant.executeNode(task, expectedOutput, inputs,
    固定的 work/run/definition/node/instance 身份, stopSignal, onActivity)
  onActivity：更新本运行实例的工具活动；过程流式推送，工具结果/结束状态保存
  节点外观按活动更新，不新增流程节点；迟到活动不能改写终态
  select-fields -> 取配置字段；缺必需字段报错；保留来源
  merge -> 合并两端口集合，保留来源
  调用后再次检查 stopSignal；已停止则忽略迟到输出
  正常返回后保存 NodeResult；每次输入/输出携带本轮版本、节点、实例 ID

stop(workId, runId):
  files.change：若已终态，返回原状态；否则设置 stopRequested 和 stopping
  中止当前模型会话；等待本地调用结束并清理
  未开始实例标为 cancelled；保留已完成结果；最终 cancelled
  外部端点是否停止计算不可由本地承诺，但本地不得继续下游或记迟到成功

retry(workId, oldRunId, failedResultId, chosenDefinitionId):
  读取失败记录的冻结输入；检查用户所选定义与输入契约兼容
  调用 start(..., 单节点, 该失败输入)，生成新的 Run
  不改写旧记录，不隐式运行上游/汇总
```

内部另有 `startComparisonSide(comparisonId, side)`：只允许由 trials 顺序调用；读取 Comparison 保存的 definitionId 与 frozenInputs，执行同一套 Run 路径。开始前在 files.change 内确认比较未停止、没有其它活跃 Run；这不是第二个执行引擎。活跃调用句柄只存在内存，重启不会恢复调用栈。
