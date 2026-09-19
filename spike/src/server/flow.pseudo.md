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
    初次生成且 draftBaseId 为空时：draftBaseId = newId
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
  files.change(workId, work => 更新 adoptedId；当采用当前草稿时对齐 draftBaseId)
  采用范围是用户明确看到的版本；历史 Run、keptResultIds 不变

discardDraft(workId):
  files.change(workId, work => draftId/draftBaseId = adoptedId 或 空)
  不删除已经用于试验的定义和结果
```

固定节点约定：Agent 一个 `input`、一个 `output`，支持 each/all；Branch 一个 `input`、两个 `match/rest` 输出，按 item.value 中明确字段分流；普通函数先只有 `select-fields`（each，input/output）与 `merge`（all，left/right → output）。用普通 switch 调用，不做插件发现。必要字段不存在时返回具体输入错误，不把缺失字段自动当作条件不匹配。

## 从历史问题进入候选：起点必须明确

例子：问题来自旧运行 r1（做法 d1），当前采用 d2，另有未采用草稿 d3。点击“改进这条结果”不能直接把修改施加到 d3，也不能默默把 d3 丢掉。

界面就近显示问题所属版本、当前采用版本、已有草稿。用户明确选择“以问题当时的做法 d1 为起点”“以当前采用 d2 为起点”或“继续现有草稿 d3”。选择某一版后，若问题节点已不在该版中，要求选定对应节点或改为修改整张图；不把旧 nodeId 强套到另一个节点。

选择 d1/d2 且已有不同草稿 d3 时，说明将替换当前编辑草稿，允许返回或继续 d3。确认替换只改草稿指针，d3 已保存定义及其试验结果保留，不建设分支管理界面。开始候选与采用做法是不同操作。

```text
beginCandidate(workId, baseDefinitionId, expectedDraftId, replaceExisting=false):
  读取用户明确选择的本工作定义
  files.change 内检查 expectedDraftId 仍等于当前 draftId
  若 baseDefinitionId == 当前 draftId：返回当前 draftId/draftBaseId，不重新初始化
  若有未采用的不同草稿且未确认替换：返回现有草稿/起点说明，不修改
  draftId = baseDefinitionId；draftBaseId = baseDefinitionId
  返回本次草稿与基线起点；随后 saveDraft 只更新 draftId

继续已有草稿：保留 draftId 与 draftBaseId，不重新初始化
放弃候选：draftId/draftBaseId 回到 adoptedId 或空
采用当前草稿：更新 adoptedId，并把 draftBaseId 对齐新采用版；若采用的是另一个已选版本，不重置现有草稿起点
```

draftBaseId 只记录用户选择的比较起点，避免刷新后重新猜；不是另一套版本系统。初次从空工作生成定义时，可把首个生成版本记为该草稿起点。试验仍显示本轮明确的基线与候选；改变起点会使旧比较与当前选择不匹配。作者请求只在起点选定后捕获 expectedDraftId。
