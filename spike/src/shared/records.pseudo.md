# 数据形状（伪代码，不是可编译类型）

只描述界面与后端当前需要互相传递的值，不建设领域模型框架。ID 是普通字符串。

```text
Work = {
  id, goal,
  materials: [{ id, text }],
  draftId?, draftBaseId?, adoptedId?,   // 指向不可覆盖的定义；draftBaseId 为所选改进起点
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
  input: Inputs, outputs: Inputs, status, error?,
  toolActivities: [{ toolCallId, toolName, args, status, result?, error? }]
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

消息转发按作者 requestId 或节点 runId/nodeId/instanceId 分组。工具结果与工作快照是不同消息：前者显示活动，后者携带实际定义更新画布；不把 toolCallId 当作跨会话唯一身份。

## 一个完整的数据交接例子（示例值，不是真实运行记录）

输入采用 [反馈材料 F01–F03](../../tests/fixtures.md)。以下标识符均为示例，实际由应用生成。模型只负责业务输出；材料和运行来源由应用附加，不能让模型猜测。

工作流入口 feedback 收到三项；分类节点的 input 逐项取出其中一项。例如 F01 的节点输入：

```json
{
  "input": [{
    "sampleId": "F01",
    "value": "界面很顺手，但导出报告经常失败，影响交付。",
    "materialIds": ["F01"],
    "sourceResultIds": []
  }]
}
```

这个分类节点的 expectedOutput（预期输出）约定为：category 必须是 issue/request/praise 中的一项，evidence 是非空依据数组，每项包含 materialId 和原文 quote。本例的字段约定不是整个产品写死的分类器；其它任务在自己的节点中说明需要的结果形状。具体如何用 SDK 接收结构结果，需在首条模型联测中验证。

Pi 完成后返回给应用的业务值可以是：

```json
{
  "category": "issue",
  "evidence": [{"materialId": "F01", "quote": "导出报告经常失败"}]
}
```

应用检查必需字段、允许值、依据引用是否属于该输入；本任务要求原文引用，还需核对 quote 来自原文。`{"category":"issue"}` 缺少 evidence，应保存为该实例失败；不能补空依据冒充成功，依赖完整分类集合的汇总也不能继续成功执行。

校验通过后，执行模块保存结果 `res-r1-classify-F01`，绑定 runId=r1、definitionId=d1、nodeId=classify、instanceId=classify:F01。来源跟着实际输入记录；输出值包装为 InputItem，再沿 output → input 连接交给报告节点。三条分类都成功时，报告节点实际得到：

```json
{
  "input": [
    {
      "sampleId": "F01",
      "value": {"category": "issue", "evidence": [{"materialId": "F01", "quote": "导出报告经常失败"}]},
      "materialIds": ["F01"],
      "sourceResultIds": ["res-r1-classify-F01"]
    },
    {
      "sampleId": "F02",
      "value": {"category": "request", "evidence": [{"materialId": "F02", "quote": "希望支持批量导出"}]},
      "materialIds": ["F02"],
      "sourceResultIds": ["res-r1-classify-F02"]
    },
    {
      "sampleId": "F03",
      "value": {"category": "praise", "evidence": [{"materialId": "F03", "quote": "团队很满意"}]},
      "materialIds": ["F03"],
      "sourceResultIds": ["res-r1-classify-F03"]
    }
  ]
}
```

报告使用 all 模式，只执行一次，NodeResult.input 保存上述三项。报告输出是一个新 InputItem：value 为正文、materialIds 为三条材料、sourceResultIds 指向报告结果自身；报告结果保存的 input 再指向三个分类结果，因此可以逐层找到来源。分类输出的 sourceResultIds 同样指向产生它的分类结果，而不是让模型生成这些 ID。

没有分类成功结果就不能假装生成完整报告。若用户只选已有两条结果明确续做，报告可以生成，但必须说明它只覆盖所选两条。上例校验是普通业务检查，不要求先建设通用 schema 平台。
