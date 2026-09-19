# 样本比较（伪代码，不可运行）

对应 E1–E4。直接组合 runs，不另建试验引擎或评测平台。

```text
compare(workId, baselineId, candidateId, nodeId, selectedInputs):
  基线默认取当前候选的 draftBaseId；候选取 draftId
  若用户显式另选比较基线，则使用该明确选择；不自动替换为 adoptedId
  没有候选起点时，先让用户选择起点，再发起比较
  候选来自当前草稿；同一节点 ID 必须存在于两边
  检查两边输入端口、each/all 模式与输入要求能使用同一组输入
  不兼容则要求明确重选/调整；不猜字段映射，不比较删除前后的不同节点
  固定输入值、样本 ID、来源；选择顺序按原材料顺序，不随列表排序变化
  files.change 内检查无活跃 Run/Comparison，创建 running Comparison
  后台顺序执行：
    若比较已停止则结束
    runs.startComparisonSide(id, baseline)；保存 runId，等待结束
    基线失败也保留失败结果并允许执行候选
    若比较已停止则不启动候选
    runs.startComparisonSide(id, candidate)；保存 runId，等待结束
    保存 completed（执行结束）或 cancelled；不声称质量已改善
  返回 comparisonId，页面可读每侧状态与结果

stopComparison(workId, comparisonId):
  设置 stopRequested 和 stopping
  若有活跃 Run，调用 runs.stop 并等结束
  不启动下一侧；保存 cancelled

readComparison(workId, comparisonId, currentSelection={baselineId, inputs}):
  返回两侧实际结果，按 sampleId 对齐；all 模式按整组对齐
  对比固定 candidateId 与当前 draftId、固定 baselineId 与当前基线
  对比 frozenInputs 与当前选择的输入值/来源（忽略界面列表排序）
  任一不同 -> stale，保留历史结果但显示“需重新试运行”
  两侧未全部成功 -> 显示具体失败/取消，不能标为成功比较
  是否 stale 从当前状态推导，不因迟到的完成事件自动恢复为有效
```

首版每次都实际运行两侧，不做历史基线缓存。Comparison 的执行状态与当前是否过期分别显示；“执行完成”也不意味着“候选值得采用”。换选节点只切换查看上下文，不改写旧比较的输入。
