# 人与 Agent 共编界面安排：现成项目与当前原语对照

2026-10-29。研究结果与建议，不是已实施能力。只修改研究文档，没有接入新依赖或改产品代码；没有运行第三方编辑器。当前源码核对来自独立产品工作区dynamic-flow-workitem-composition，原托管实例保持不动。

## 研究问题

用户给出的list(some_data, op=detail)、detail(it)=...，要求界面安排可理解、可组合、可指认，并能与Agent共同编辑。默认业务工作面用于推进工作；需要调整时，用户能指着某份列表、某个详情或动作讨论并修改其安排。组件检查器只是辅助，不能替代这份共同编辑对象。

同时保留两项约束：工作项流程薄，复杂处理复用流水线；最终交付必须支撑真实业务闭环。CVE例子要回答受影响仓库/版本、实际实施仓库、缺口和逐条验收，而不是生成一个好看的静态页面。

## 最贴近的现成项目

| 项目 | 已有能力与原始来源 | 对我们的价值 | 不直接视为已解决的部分 |
| --- | --- | --- | --- |
| OpenUI Lang | 具名语句、组件调用、引用和按名称合并补丁；可注册自己的组件/动作 | 最接近可读界面描述及Agent局部修改；有现成parser/AST/serializer/merge可评估 | 不等同于用户可直接写任意detail(it)函数；也不提供我们的工作项修订、来源和业务验收 |
| amis / amis-editor | 同一Schema表达列表、当前行详情、表单和事件，插件提供可视化配置 | 最接近用户直接编辑与声明共同驱动页面的形态，行作用域可参考 | 全量组件、表达式及请求体系超出我们当前原型；不是直接换掉现有设计体系的理由 |
| Windmill Apps | 组件输入/输出可连接，按钮绑定已存在脚本或flow，界面与执行分别编辑 | 方法目录、UI绑定、现有执行器的桥接方式 | 不提供我们持续工作项的固定交付/验收语义；其low-code文档已标legacy，现开发重点是full-code |
| json-render | 当前已有的有限组件/绑定/动作渲染，另有开发Devtools | 保留现有控件和渲染资产；可用作界面描述的呈现底座 | Devtools以调试为目标，生产默认不显示且可编辑state，不能冒充用户协作编辑器 |

事实来源：[OpenUI语法](https://www.openui.com/docs/openui-lang/syntax)、[组件注册](https://www.openui.com/docs/openui-lang/defining-components)、[增量编辑](https://www.openui.com/docs/openui-lang/incremental-editing)；[amis列表与详情](https://github.com/baidu/amis/blob/master/docs/zh-CN/components/crud.md)、[编辑器插件](https://github.com/baidu/amis/blob/master/packages/amis-editor/src/plugin/CRUD.tsx)；[Windmill组件连接](https://www.windmill.dev/docs/apps/connecting_components)、[当前full-code方向](https://www.windmill.dev/docs/full_code_apps)；[json-render Catalog](https://json-render.dev/docs/catalog)、[Devtools](https://json-render.dev/docs/devtools)。

这些项目分别解决表达、编辑或执行桥接。将它们组合为适合本项目的薄工作项，是我们的设计判断，不是它们现成功能的宣传。

## OpenUI可复用到什么程度

OpenUI的parser有现成组件调用、引用和运行时表达式AST；serialize与merge按具名语句组织。实际merge是同名覆盖、新名追加，删除不再从root可达的声明。它没有我们的baseRevision冲突检查；不能直接拿字符串merge代替工作项保存入口。当前仓库快照的Statement只有value/state/query/mutation，没有用户定义参数化函数的独立语法节点。因此，不能把示意detail(it)=...说成它现成支持的原生函数定义；重复模板可参考其@Each，或由注册组件承担。其他部分仍需验证。

[源码AST](https://github.com/thesysdev/openui/blob/1492107c8d24805a19651ad57420156f702bbda5/packages/lang-core/src/parser/ast.ts)、[合并实现](https://github.com/thesysdev/openui/blob/1492107c8d24805a19651ad57420156f702bbda5/packages/lang-core/src/parser/merge.ts)、[模板迭代与函数](https://www.openui.com/docs/openui-lang/functions)。

OpenUI也带Query/Mutation、客户端计算和顺序动作；官方动作文档还说明部分restricted slots目前仅影响schema/prompt，运行时并未强制限制。因此只注册组件或在prompt里说不能做某事，不足以保持我们已有业务边界。若采用其parser，须评估明确子集及AST校验；若采用其renderer，就应让动作经过我们已有服务，而不是另建一条浏览器到任意方法的执行路径。此处是接入前的技术判断，尚未进行适配验证。[查询与写入](https://www.openui.com/docs/openui-lang/queries-mutations)、[动作与限制](https://www.openui.com/docs/openui-lang/actions)。

## 与现有工作项原语逐项对照

当前执行原语由shared/records.ts、node-ports.ts及原flow/runs实现。当前展示原语由shared/item-ui.ts、workitem-composition.ts及composition-ui.ts实现。下面明确哪些可以连接，哪些语义不同。

| 用户可读表达 | 当前对应 | 保持的职责与界限 |
| --- | --- | --- |
| 输入(本批材料/补充值) | compositionInputs、ItemInputSelection、receivedInputs | 工作项保存引用与修订；旧Run输入保持固定 |
| 调用(保存的方法, 输入) | FlowNode.call，固定workId/definitionId和具名端口 | 仍由唯一Run执行器启动；界面动作不绕过它 |
| map / flatMap | FlowNode.operation=map/flatMap | 形成处理实例/结构化结果；list只是展示同一集合，不再启动fanout |
| collect / join / groupBy / reduce | 既有函数及表达式reduce | 合并规则和业务分组属于处理方法；groups视图仅按字段组织展示，不产生新的业务覆盖结论 |
| 查看(某逻辑输出) | Definition.outputs → ItemDelivery及精确OutputReference | 编辑时按逻辑输出连接；实际成果绑定成功Run，不能改为随时读取某个最新值 |
| list / table / groups | 当前ItemPresentation的table/groups | 当前没有独立list及任意行模板；可读层不能假装已有通用模板能力 |
| detail(it) | 当前presentation.details、RecordDetail | 当前为视图内顶层字段列表，尚无具名/共享/参数化详情定义 |
| form(所选记录, 补充字段) | ItemUiAction.input、fields、recordField、固定method | 字段取真实inputContract；服务端重读原记录，追加received修订后显式运行 |
| 继续(所选集合, 方法) | ItemUiAction.continue → continueRecords | 服务端按稳定记录ID取值并保留来源，可接同方法或另一公用方法；不把当前筛选页面的行下标当身份 |
| 人工核对 | ItemUiAction.review → 既有完成条件任务 | 条件与依据由人确认，Run成功不结项 |
| when / 可用条件 | 当前equals/empty/not-empty及actionBlockers | 用于呈现动作前提，服务端执行时同样检查；不代替branch业务分支 |
| 等待 | 现有wait节点、RunWait和事件恢复 | 补输入表单与暂停运行不是同一个概念；只有确需继续同一Run时才映射现有wait/signal |
| 建立子项 | 现有create-items与工作项业务服务 | list渲染、调用实例均不自动建立新业务身份 |

当前执行侧也有branch、milestone、dynamic等能力，不需要全部暴露为界面语言。工作项只保留本例必要的调用及引用；调用内部仍可检查流水线原语。

## CVE实例：薄调用与可读界面怎样接起来

下面是建议的人类可读表示，既不是现有API，也不是OpenUI原生语法；它用于检验需要表达的语义，避免先选一种文本语法再牺牲业务需求。

```text
本轮处理 = call(已保存的批次核查方法, input=本项输入.批次)

仓库影响 = groups(
  本轮处理.outputs.impact,
  by=repository,
  key=id,
  row=影响摘要,
  detail=影响详情
)

影响摘要(it) = row(it.cve, it.requestedRef, it.baseline, it.conclusion)
影响详情(it) = detail(
  title=it.repository,
  fields={"适用版本": it.baseline, "判断依据": it.reason, "证据": it.evidence},
  actions=[补充依据(record=it)]
)

补充依据 = input(
  method=已保存的补证方法,
  fields=该方法的输入字段,
  submit=准备本项新输入并明确运行
)

改动安排 = table(本轮处理.outputs.changes, ...)
逐条交付 = table(本轮处理.outputs.audit, ...)
验收检查 = report(本轮处理.outputs.completion, action=人工核对)
```

第一步规范化、调查拆分、判断汇合和逐原告警覆盖检查仍在批次核查流水线。展示只连接已声明输出。每个it是具有稳定ID和实际来源的记录，点击操作时只提交记录ID和补充字段；服务器按绑定交付重读。是否受影响、哪些实际仓库要改不由UI字段或本地分组推断。例外由明确输入进入处理，再由人工最终确认。

## 用户与Agent如何共同编辑

共同操作的对象应是具名视图及其字段、详情和动作引用。页面点选仓库影响能定位该声明，用户指着影响详情说增加证据位置，Agent只修改对应段落；用户在结构编辑中改字段名也保存到同一模型。修改应能看出具体影响范围，结果可以立即预览；无关视图不因整份重生成而丢失。

只有一份持久权威。可读文本、结构编辑和预览是它的不同表现，不各存一份业务含义。若保留当前ItemUiPlan作为权威，可读表示须可逆；若选择现成语言AST作为权威，旧ItemPresentation须成为确定性生成的运行投影，而不是另一份独立可写状态。两种方案需用实际往返和错误场景验证后选一，当前不假装已完成选型。

人和Agent仍通过同一baseRevision及保存服务修改；Agent收到具名片段、可用字段/方法合同和定位清楚的校验错误。改列名或详情顺序不启动业务运行、不改原始判断；修改处理逻辑才走Definition版本；点击业务动作才准备输入/启动已有Run。流式未完成修改不能提前改变正式视图和业务动作。

## 对当前实现的结论与最小验证

已有uiPlan、固定输出绑定、六种现有控件适配、三类业务动作和共享服务可继续复用。真实缺口是：可读可修改的具名结构、列表与详情的显式引用，以及页面位置与声明位置的双向定位。不是多加一个按钮或把JSON全文贴出来。

优先候选是OpenUI Lang的具名表达/局部修改，amis的同Schema编辑思路，以及Windmill的方法桥接方式。它们是选择依据，不是同时接入三个框架。现有json-render保持为当前渲染基线；是否复用OpenUI parser或替换底座，应先做一个隔离的往返验证，不并行维护两套UI运行时。

验证应仅围绕一份实际影响清单：读取固定输出→列表/详情→补输入调用现有方法；用户修改一个标签，Agent增加一个详情字段，再往返编辑/渲染。验证具名引用不漂移、无关块不变、方法版本/来源不被偷换、UI分组不新增Run、错误定位到具体声明、保存冲突不覆盖、未完成文本不发布。只有这些成立，才能说现成表达方式适合本项目。当前研究没有实施这一步。
