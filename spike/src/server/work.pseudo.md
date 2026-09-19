# 工作、材料与产物（伪代码，不可运行）

对应 A1、D1/D2、F2–F4。只提供这些具体操作，不建通用 CRUD 平台。

```text
createWork(goal, confirmedMaterialTexts):
  缺目标/有效材料 -> 返回字段问题，前端保留输入
  创建 Work 与稳定材料 ID；初始 draftId/adoptedId 为空
  保存成功才返回 workId

addMaterials(workId, texts):
  files.change：追加带新 ID 的材料，返回新增 ID
  不覆盖旧材料或历史输入；新 Run 明确选哪些材料

readWork(workId):
  读取保存的工作、草稿/采用定义、运行、结果、比较与消息
  返回界面需要的数据，内部 ID 用于关联，界面显示名称/版本

keepResults(workId, resultIds):
  确认属于该工作且成功；files.change 追加 keptResultIds，去除重复 ID
  不修改 adoptedId；支持只保留候选结果但不采用候选

continueWithResults(workId, definitionId, targetNodeId, selectedResultIds, confirmed=false):
  从明确选中的成功结果提取目标端口输入；显示值、来源和数量供确认
  普通反馈场景里，同一 sampleId 选了多个结果版本 -> 提示选择其中一个
  汇总结果等多材料产物若来源重叠 -> 展示重叠，要求用户明确输入，不能自动去重或选最新
  校验目标节点能接收这些输入；不兼容就提示缺失字段/端口
  confirmed=false 时只返回预览；confirmed=true 时重新检查这组不可变结果并校验
  确认且无冲突才 runs.start(..., 单节点, 所选结果的冻结值和来源)
  不把所有 keptResultIds 自动送入新运行

report(workId, runId, outputName):
  读取本轮声明输出；单节点试运行只展示其节点产物
  返回正文、定义、来源、输入范围、完整性
  未生成/失败/中断时如实呈现；可检查部分结果，但不冒充完整报告
```
