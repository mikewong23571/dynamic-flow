# 数据形状（伪代码，不是可编译类型）

只描述界面与后端当前需要互相传递的值，不建设领域模型框架。ID 是普通字符串。

```text
Work = {
  id, goal,
  materials: [{ id, text }],
  draftId?, adoptedId?,                 // 指向不可覆盖的定义文件
  view: { nodePositions, zoom },
  runs: [Run], comparisons: [Comparison],
  keptResultIds: [], messages: []
}

Definition = {
  schemaVersion: 1, inputs: [name], nodes: [Node],
  edges: [{ from: [nodeId | "$input", port], to: [nodeId, port] }],
  outputs: { name: [nodeId, port] }
}
Node = { id, label, kind: agent | function | branch, mode?: each | all,
         task?, expectedOutput?, functionName?, params?, condition? }
// Node 只描述一步做什么。工具调用日志不是新流程节点。

InputItem = { sampleId, value, materialIds: [], sourceResultIds: [] }
Inputs = { portName: [InputItem] }
// 数组可以为空；未提供端口和端口内容为空是两件事。

Run = {
  id, definitionId, scope: full | { nodeId }, inputs: Inputs,
  status, stopRequested: false, comparisonId?,
  nodeStates, results: [NodeResult], events: []
}
NodeResult = {
  id, runId, definitionId, nodeId, instanceId,
  input: Inputs, outputs: Inputs, status, error?
}
// 逐项输出保留 sampleId；汇总输出记录全部来源材料与结果。
// 失败/取消不是成功的空输出。旧结果不能被新运行改写。

Comparison = {
  id, baselineId, candidateId, nodeId, frozenInputs: Inputs,
  baselineRunId?, candidateRunId?, status, stopRequested: false
}
```

初次生成只形成 draft；第一次运行明确使用 draft，不偷偷称为“已采用”。采用后默认运行 adopted；运行草稿或候选需在界面明确显示所选版本。视图坐标不在 Definition 中。

状态约定：Run 使用 queued / running / stopping / completed / failed / cancelled / interrupted；节点还可为 blocked。Comparison 的 completed 只代表两侧已结束，需另看每侧成败与基于当前草稿计算的 stale。

这些结构只是首版直接需要的记录；非功能性布局不进定义。输入选择按稳定材料次序冻结，展示排序不是执行输入变化。运行结果保存 input 的值而非仅保存可变化的材料引用。
