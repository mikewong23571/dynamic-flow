# Assistant：Pi 作者、工作项推进与节点执行

本模块复用 Pi 会话和工具循环；工作项对话、方法作者及节点执行分别提供上下文，不另建聊天运行时。

| 入口 | 负责什么 | 交接 |
| --- | --- | --- |
| `workitem.ts` | 当前工作项多会话、发现方法、编辑同一Definition、原生OpenUI程序、调用真实业务动作 | `work-items/composition.ts`、`shared/openui.ts` |
| `index.ts` | 方法作者requestEdit/stopEdit、节点executeNode、模型目录设置 | flow、files、runs |
| `pi.ts` | Pi SDK适配、流式活动、取消、会话及制品 | 当前工具和持久会话目录 |
| `item-conversations.ts` | 工作项conversationId与独立会话目录 | 工作项作者与前端Assistant |
| `validation.ts` | submit_result及最终回复共用输出schema验证 | rawOutput保留实际失败诊断 |
| `catalog.ts` / `settings.ts` / `config.ts` | models.toml、脱敏公开配置、目录选择 | 模型配置只有目录来源，无假模型回退 |
| `expression-guide.ts` / `collection-guide.ts` | 作者可见的IR合同 | flow校验与runs解释执行 |
| `profile-flow.ts` | 文件剖析方法及产物读取 | server入口启动/收尾 |
| `mcp.ts` / `mcp-extension.js` / `shared-websearch.ts` | MCP接入 | Pi工具，不代替业务动作 |

## 系统准则与能力说明

workitem.ts中的workItemSystemPrinciples是实际传给工作项Assistant的高层系统准则，位于每轮systemPrompt最前，并由describe_capabilities返回同一文本。准则界定业务身份、事实权威、Assistant自主组织、可感知/可参与、真实动作与人工完成的边界；不规定具体业务页面模板。低层IR/OpenUI/工具说明从属于这些边界。边界改动须同步[系统准则](../../../docs/workitem-system-principles.md)及实际命令，不用prompt代替服务端机制。

## 唯一处理路径

工作项作者先inspect_work_item，再查找/读取明确方法合同。save_flow保存本项Definition；已有方法固定为call引用。select_inputs选择原材料，bind_inputs保存精确material/result/received/child/completion引用，add_input/revise_input提交用户补充。不能复制结果正文冒充原材料。

原生OpenUI source是唯一界面程序。describe_capabilities返回与实际Renderer共用的组件、schema和读写工具说明；check_ui_program、save_ui_program、update_ui_program复用官方SDK解析与merge。保存必须完整解析，未知组件、未解析声明和Query写工具都拒绝。局部编辑使用同一程序具名声明。页面和作者保存都检查baseRevision、expectedProgramId、definitionId；冲突读回，不覆盖。

Query只读read_workspace/read_inputs/read_children/read_output/read_delivery；Mutation只在用户动作中调用真实工作项命令。草稿和历史预览仅提供读工具，不能通过挂载执行写命令。Records和Report从固定delivery读取真实成果；记录身份由保存程序派生并冻结rowKey，继续只交deliveryId/recordIds及用户明确输入，不信任客户端记录正文。

execute只启动实际Run。inspect_run确认终态，publish_delivery只发布明确成功commit的指定输出，并传当前programId。continue_records仅准备下一轮，执行仍需明确动作。失败输入补跑形成新的commit；旧失败与旧成功保持原样，汇合必须明确bind_inputs。等待和中断通过signal/resume继续原Run。模型不能确认完成条件或代替人结项。

## 方法作者与运行

画布和作者修改同一Definition；普通节点operation=map/flatMap/aggregate，call=map/aggregate，map明确eachPort，其他端口广播。控制节点按kind语义，不保存mode或隐式resultOutput。

readItemContext注入本项实时输入；EditRequest.sampleSource只在该次请求读取固定Run样本，不将作者样本写回公共Work。节点执行冻结Definition、输入和材料；没有真实input.materialIds的材料引用拒绝。普通输出按schema验证，不按任意字段名或文本扫描推断证据。submit_result与最终Markdown/JSON回复共用schema处理；失败原始输出可诊断，不能吞错显示成功。

Pi持久会话提供历史和自动压缩；新请求提供当前快照，不将全部旧活动再次拼成大prompt。每个工作项conversationId独立持久目录，页面动作必须携带当前conversationId。停止使用AbortController；网络、配置、模型、工具、版本冲突均如实反馈。

## 配置与验证

根models.toml为模型目录，dataRoot/model-settings.json为默认选择，Work覆盖优先于默认。配置公开API不能暴露api_key/custom_headers；测试复制到临时目录，不改用户选择。MCP配置来自只读环境文件，不写入证据。

模块验证：`tests/assistant.test.ts`、`tests/functional-author.test.ts`、`tests/multi-input-author.test.ts`、`tests/openui.test.ts`、`tests/workitem-conversations.test.ts`、工作项后端集成测试。原生浏览器入口为`tests/browser/openui-*.spec.ts`及会话/固定方法/导航场景，使用独立临时数据与随机端口。替身测试只证明接线；真实模型和两尺寸视觉证据单列在当前track。
