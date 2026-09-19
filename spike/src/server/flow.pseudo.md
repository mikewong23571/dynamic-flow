# 流程编辑（伪代码，不可运行）

对应 B1–B4、E1、E4、F1。画布与 Assistant 都调用同一个 saveDraft。

```text
saveDraft(workId, expectedDraftId, nextDefinition):
  检查对象形状；形状坏了不保存，配置未完成仍允许保存
  在最新工作上检查 expectedDraftId；不匹配立即返回草稿冲突
  如果执行相关内容与当前定义完全相同：返回当前 ID（不创建版本）
  newId = files.writeNewDefinition(nextDefinition)
  files.change(workId, work =>
    如果 work.draftId != expectedDraftId：返回“草稿已变化”，不覆盖
    work.draftId = newId
  )
  返回已保存 ID、节点/参数/连线变化、节点级配置问题
  // 写入失败或草稿冲突都不能声称“已修改”

saveLayout(workId, positions, zoom):
  files.change(workId, work => 只修改 work.view)
  不创建新定义；不影响比较有效性

checkDefinition(definition):
  检查重复节点、未知类型/函数/端口、缺少任务/参数、悬空边/输出引用、环
  条件只支持明确字段与有限比较操作，不接受任意表达式
  每个输入端口最多一条来源；多源汇合通过明确 merge 节点
  输出问题包含 nodeId/edgeId 或对应连接、字段、说明与下一步

validateForRun(definition, scope, inputs):
  全流程检查整个定义；单节点只检查该节点配置及显式输入
  验证所需输入端口存在、值为集合、元素满足该节点输入要求
  区分“端口缺失”和“端口为空数组”
  全流程采用拓扑顺序；不支持的环返回局部问题
  单节点缺输入则要求选择结果/补材料/明确运行上游；不偷偷补跑

adopt(workId, definitionId):
  checkDefinition 必须通过；定义无需依赖本轮输入才能采用
  files.change(workId, work => 只更新 adoptedId)
  采用范围是用户明确看到的版本；历史 Run、keptResultIds 不变

discardDraft(workId):
  files.change(workId, work => draftId = adoptedId 或 空)
  不删除已经用于试验的定义和结果
```

固定节点约定：Agent 一个 `input`、一个 `output`，支持 each/all；Branch 一个 `input`、两个 `match/rest` 输出，按 item.value 中明确字段分流；普通函数先只有 `select-fields`（each，input/output）与 `merge`（all，left/right → output）。用普通 switch 调用，不做插件发现。必要字段不存在时返回具体输入错误，不把缺失字段自动当作条件不匹配。
