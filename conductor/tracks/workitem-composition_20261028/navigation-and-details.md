# 明确导航、输入职责与记录详情

2026-10-29，主代理独立实施，无子代理。当前代码仅独立工作区，当前[预览工作项](http://10.134.94.200:4330/items/852367c9-7ff7-4aba-8da8-ae0550d7d823?tab=results)。本节取代R阶段的数量阈值导航、成果核对条及旧详情布局。

## 用户指出的内容来自哪里

| 内容 | 原来源 | 当前职责 |
| --- | --- | --- |
| 本批告警与范围判断材料 | 真实Assistant的uiPlan.inputs[].title | 保留该声明，只在输入页显示 |
| 已保存输入 | PlannedWork固定状态文案 | 移入PlannedInputs；只表达输入已保存 |
| 成果已更新，仍有内容待核对 / 查看核对项 | 前端根据review条件自动拼接 | 已删除该成果进展/捷径推导及interface-progress模块 |
| 记录详情标题 | 前端写死；Modal无description时另有同名sr-only描述 | 使用模型Detail.title和独立记录ID，唯一标题 |
| 覆盖告警、依据等字段/标签 | 模型Detail.fields与固定输出值 | 继续按同一声明读取，不解释CVE |
| 详情底部来源、依据、子项、比较 | 前端固定工具 | 来源独立，其余进更多菜单；不冒充模型业务步骤 |
| 补核查/确认例外等业务动作 | 模型view.actions | 列表与详情共享声明和同一命令，详情明确使用当前单记录 |

旧问题没有CVE字段判断分支，但通用外壳越权生成业务提示。修复收回的是这层职责，不是用另一组固定业务文案替换。

## 最小协议与实现

Workspace增加navigation=tabs/select，views顺序决定呈现顺序。工具schema要求模型明确选择，结构编辑器有“视图导航”，描述formatter/parser往返同一字段；旧缺省只按tabs读取，无迁移。ViewNavigation在执行前预览和真实成果共用现有Tabs/NativeSelect，没有4/5个视图阈值或任意布局平台。使用明确12px，溢出按同一Tabs横向阅读，不切换控件。navigation是UI计划属性，不进入Definition/Run。

composition-ui保存navigation并按原规则检查修订/同Run重绑。实际先发现其显式字段拷贝漏了navigation：文本解析正确但刷新值丢失。HTTP断言保留失败现场，补齐保存字段后同源往返通过；没有删除断言或退回前端本地状态。

PlannedInputs从原组件拆出，保留真实合同、受控草稿与输入修订，放到输入Tab。PlannedWork只负责尚未绑定当前成果时的执行/绑定；成果发布后不再占位置。修改输入后旧成果仍固定，明确重新运行。业务缺口/下一步及review只在模型声明的视图/动作中表达，全局完成条件入口保持，运行/发布不自动结项。

resolvedUiView把Detail.title连同字段冻结为presentation.detailTitle；内联详情标题规范化进模板。详情显示该业务标题和真实记录ID，正文的数组间距收紧。底部左侧来源及RecordTools更多菜单，右侧为既有UiActionBar声明动作；没有新的业务动作种类或执行器。detailActionSpec复用deliverySpec编译，明确recordIds=[详情ID]而不修改表格selection。输入动作关闭详情再开原有表单；错误留在相应上下文，必要revision/store依赖明确。

## 实际验证

- 类型/构建通过，保留既有大chunk提示。
- UI协议/HTTP/输入合同7项通过：tabs/select往返、非法navigation拒绝、模型详情标题冻结、导航保存重绑同Run；原子失败和条件规则仍有效。
- 相邻组合/会话/合成CVE模块9项通过，单独日志，不冒称全仓重验。
- 当前导航/详情/输入浏览器5项通过：两尺寸5视图Tabs→人改select→工具fixture改tabs→刷新一致；详情标题唯一、工具收纳，表格选R1但详情动作只使用R2，原勾选保持；输入页保存/修订与旧成果固定。
- 相邻共编/多会话/完整模板CVE路线8项通过，原来源/引用/结项主线两尺寸2项通过。分轮共15条，各使用临时数据/随机HTTP与明确fixture，没有连接托管实例。新用例最初遗漏saveFlow的expectedDraftId而失败，修正用例通过真实版本参数，不改产品并发保护。
- 真实默认DeepSeek V4 Flash/high一轮64.635秒，inspect_work_item/describe_capabilities/check_ui_program/save_ui_program/publish_ui_plan/inspect_work_item后明确保存navigation=tabs。理由为需要反复比对范围、缺口、实施改动和逐条记录。5视图、顺序、全部字段/模板/动作/inputs、Definition、4次Run、材料与条件均与此前一致；只改展示及固定成果绑定。不是前端默认或fixture冒充模型选择。
- 实际4330查看1440×900、1024×768：五个明确Tab、详情标题与编号、紧凑数组、更多菜单；打开worker-D详情的真实补核查表单并关闭，未提交。输入任务仅在输入页，成果无旧输入保存/核对条。两尺寸零pageerror，Run/Definition/uiPlan/条件不变。已逐屏看图，最终图在navigation-contract-real；用户审美接受另列。

日志分组位于evidence/navigation-contract-final，真实模型/脚本/8张实际截图位于navigation-contract-real。模型代码/密钥配置未因本轮改动；仅更新工作项Assistant作者合同与提示。后端仅在审计5个预览工作项无活动Run/Assistant后重载独立4331，托管4320/4321未停止/重启/部署，原目录src保持起点一致，无提交/推送。

## 未解决的边界

R阶段跨方法动作自动回接原界面的合同缺口仍在，不因本轮导航/详情操作可用而声称解决。真实预览只打开表单，没有代填例外或确认完成条件；原合成判断不代表真实安全审计。当前有限导航/字段/动作不支持任意布局或UI脚本，未扩展未来通用平台。
