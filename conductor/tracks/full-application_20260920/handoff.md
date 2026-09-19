# 最小交接与独立任务

共享类型为 src/shared/records.ts。修改需通知根 agent，不能各自扩展出不兼容字段。直接函数调用，无额外框架。所有函数抛 Error；HTTP 捕获返回 {error,issues?}，前端保留用户输入。ID 使用 randomUUID；只展示短版本标识，完整 ID 保留在状态。

## 文件与流程 / 状态开发者

改动域 src/server/{files,flow,work}/ 与 tests/state.test.ts。目标：真实文件保存、版本起点、材料、保留及续做预览。非目标：HTTP、Pi、执行、前端。影响域：调用方 runs/assistant/server，交接返回类型保持如下。

- createFiles(root) 返回 FileStore；export type FileStore。create(work):Promise<void>、read(workId):Promise<Work>、list():Promise<Work[]>、change(workId,(work)=>void):Promise<Work>（串行且持久化后通知）、writeDefinition(workId,definition):Promise<string>、readDefinition(workId,id):Promise<Definition>、onChange(listener:(workId)=>void):()=>void、onServerStart():Promise<void>。读取应隔离副本，定义只存不可变 JS 文件，work.json 只存引用。可增加方法但不删改签名。
- createFlow(files) 返回 FlowService。saveDraft(workId,expectedDraftId:string|undefined,definition):Promise<string>；beginCandidate(workId,sourceId:string,replaceExisting=false):Promise<string>；saveLayout(workId,view):Promise<void>；adopt(workId,definitionId):Promise<void>；discardDraft(workId):Promise<void>；snapshot(workId):Promise<Snapshot>。export checkDefinition(definition):Issue[] 和 validateForRun(definition):void。端口：外部 $input/<definition.inputs>，普通节点 input→output，branch input→matched/unmatched，merge left/right→output。each/all 仅 agent/function，branch 一次分流。draft可保存不完整配置；结构坏类型要拒绝。
- createWorkService(files) 返回 createWork(goal,materials:string[]):Promise<Work>、addMaterials(id,texts):Promise<void>、keepResults(id,resultIds):Promise<void>、previewResults(id,resultIds):Promise<Inputs>（输出 input 端口，检查重叠材料/结果；只能成功结果）；其余报告由快照中结果读，不复制。
- 示例：F01 input.value 是材料正文，分类 output.value 是业务对象；来源由 runs 包装，不由模型构造。

## Pi / Assistant 开发者

改动域 src/server/assistant/ 与 tests/assistant.test.ts，可另建该域真实协议探测脚本。目标：真实 Pi createAgentSession；配置三协议；作者 update_flow/inspect_result；节点输出；取消/流式与活动。非目标：运行调度/HTTP/前端。影响域：flow.saveDraft、files.change、runs executeNode。

- createAssistant(files:FileStore,flow:FlowService) 返回 requestEdit(workId,request:EditRequest):Promise<string>（先保存用户及助手消息，返回requestId，后台完成）；stopEdit(workId,requestId):Promise<void>；executeNode(context:NodeExecution):Promise<Json>；configuration():{ready:boolean;protocol:string;model:string;error?:string}（无密钥）。可导出 loadConfig 和执行注入点供模块测试。
- 请求固定 expectedDraftId/nodeId/sampleIds；每次工具保存后期望版本更新为自己刚保存版本；其他人修改时拒绝覆盖，提案存消息供检查。selected node 情境限制其它节点改变（除非用户明确发起全流程编辑）。作者消息保存经 files 通知实时快照。
- NodeExecution.onActivity 由 runs 绑定身份；助手只提供当前工具活动。材料依据检查原始引用，输出按 expectedOutput 简单 JSON Schema（type/object/properties/required/enum/items/minItems）校验；复用已有 SDK/schema 包如合适。文本报告未声明 schema 时可返回文本。不得硬编码分类器。

## 前端开发者

改动域 src/client/ 与 tests/client.test.ts，可创建该域文档/样式。目标：十九故事的实际工作台；React Flow、assistant-ui、统一 Radix/基础控件；先查看真实设计实例，记录选择，不能复刻旧Spike。非目标：后端/包配置/shared/集成验收。影响域：以下 HTTP/SSE，按实际共享类型实现；接口缺项先发消息。

入口 src/client/main.tsx 挂载 Workspace（默认导出）。API：
- GET /api/config → configuration；GET /api/works → {works:[{id,goal,updatedAt}]}；POST /api/works {goal,materials:string[]} → Snapshot。
- GET /api/works/:id → Snapshot；GET /api/works/:id/events → SSE event:snapshot data:Snapshot；初次/重连完整状态。revision 防倒灌；流式快照不得覆盖未提交配置、重置视口/选择。
- POST /api/works/:id/actions {action,...fields} → Snapshot；action 为 addMaterials {materials}、saveDraft {expectedDraftId,definition}、beginCandidate {sourceId,replaceExisting}、saveLayout {view}、adopt {definitionId}、discardDraft、keepResults {resultIds}、run {definitionId,scope,inputs}、retry {runId,resultIds}、stopRun {runId}、compare {baselineId?,candidateId,nodeId,inputs}、stopComparison {comparisonId}、edit {text,expectedDraftId,nodeId?,sampleIds?}、stopEdit {requestId}。
- POST /api/works/:id/preview-results {resultIds} → {inputs:Inputs}；确认后 run {scope:{nodeId:下游},inputs,definitionId}。明确显示所选输入。
- run默认 adoptedId || draftId，用户可明确选择草稿；试验/比較 scope 为一个 node。full inputs 使用定义 inputs 首个端口，内容为材料InputItem；single 普通 input/merge left,right。切节点保留各自样本选择。
- 比较 stale 由 candidateId !== work.draftId 或当前选择输入集合改变判断；排序不改变；基线默认 draftBaseId。每侧run在work.runs中。

## 根 agent

改动域 src/shared、src/server/{index,runs,trials}、根工具配置、集成/浏览器测试与track。目标：固定交接、执行与比较、模块接线及最终产品验收。非目标：替子agent重做整域实现或增加平台。负责消解跨域问题并同步调用双方。

模块先域内自测，无重度审计；完成后报告实现、测试命令、未测项与对调用方影响。不提交 Git，由根统一提交。用户已授权完整十九故事，过去“范围待讨论”不再是阻塞。
