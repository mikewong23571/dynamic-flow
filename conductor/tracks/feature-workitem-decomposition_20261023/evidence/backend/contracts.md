# 三方实施接口（实施中）

- GET `/api/items?summary=true&parentId=...&rootId=...&view=children|todo|all|excluded&page=1&pageSize=25&ids=a,b`: WorkItemSummaryPage。旧不带summary请求保持旧行为。轻量行含有序runs用于跨方法轮次。
- POST `/api/items/:id/prepare`: `{workflowId?,definitionId?,inputSelections?}` → ItemPreparation。只读，issues不为空不启动。默认选未替换received，随后文本，再完成依据；复用同方法明确映射。
- POST `/api/items/:id/actions`:
  - `createChildren` + CreateChildrenRequest → `{receipts:ChildCreationReceipt[]}`。
  - `candidates,source:CandidateSource` → `{candidates:WorkItemCandidate[],receipts}`。
  - `reviseInput,inputId?,source?:OutputReference,label?,value:Json` → WorkItemView。
  - `scope,status:included|excluded,reason,confirmReopen?` → WorkItemView。
  - `completionInputs` → `{selections:completion[],uncovered:{id,title,status}[]}`。
  - `reopen,reason,confirmReopen?` → WorkItemView。
  - `complete` → WorkItemView，首次结构性完成即保存childCompletions。
  - `run` 原请求支持新received/completion选择，仍返回WorkItemView。
- 缺少确认的层级变更失败体含 `{error,affectedAncestors:[{id,title}]}`，同动作confirmReopen:true明确重发。
- GET `/api/works/:id?runIds=a,b`：同Snapshot形状，work.runs仅明确所选run，相关definitions保留。只读检查减传输，不改变编辑快照。

共享DTO在records.ts。CandidateSource是OutputReference+kind output/node-input。运行器hook onCreateItems(parentId,source,signal)→receipts；正式full/commit才写，runtime保存部分回执后如实失败。后端不建批量调度器；UI复用prepare/run，按本批当前保存状态控制新启动。

candidates action 显式提供page/pageSize时返回 `{candidates:当页,receipts:每候选当前回执,candidateIds:全清单ID,total,page,pageSize}`；默认25，最大100。未提供page的已有内部调用保持完整列表。createChildren仍通过source+candidateIds解析服务器固定清单，edits只覆盖选中的候选。

createChildren可显式appendInputs:true：同父已有项收到本候选新输入，返回inputsAppended:true；仅关联不追加。ReceivedItemInput.origin固定候选source/candidateId/inputIndex，实现同源重试去重。已结项且确有新输入时该行failed+childId，要求先明确重开；已交接同源请求可重复成功。
