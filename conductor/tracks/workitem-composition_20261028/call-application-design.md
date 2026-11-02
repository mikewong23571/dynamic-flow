# 流水线定义、应用节点与图的分层

2026-10-29，按用户纠正形成并实施的展示合同。本文件是本阶段实施合同，用户已同意优化；N内嵌卡片被本方案取代；当前实施与分层证据见下方记录。

## 第一性语义

流水线Definition是一份有输入、输出和内部依赖图的方法描述；工作项中的call是对其固定版本的一次应用位置。外层图的一个节点可以引用另一张图，内层定义没有被复制进外层。chain只是外层DAG中恰好串行的一种形态，不是call的限制。引用关系属于定义的层次，节点和边属于本层的数据依赖；二者不能在视觉上都叠成节点容器。

WorkItem负责业务身份、材料、交付与人工完成要求；其私有Work/Definition保存必要的应用及胶水关系。胶水可以包含输入构造、分发、关联与汇合；复杂领域判断留在可复用方法中，仍由唯一运行器执行。薄不等于限制为单call，也不强制前后各加一个节点。单纯端口传递使用边，实际数据变换才使用已有function/agent/call等明确步骤。

## 优化后的画面

call节点本身就是流水线应用，取消N的内嵌引用卡片：类型/图标表达流水线，主标题为实际引用方法名，固定版为次信息。应用方式直接显示“整批调用”或“逐项调用”，本次业务用途在与标题不同且有真实声明时作为简短摘要。输入输出是该节点的真实具名端口，保留边的分叉和汇合。

```text
          流水线 · 逐项调用                 流水线 · 整批调用
        ┌─────────────────┐             ┌─────────────────┐
目标 ──▶│ 目标核查      ↗ │──影响──┐    │ 仓库清单整理  ↗ │──仓库──┐
依据 ──▶│ 固定版本 ……     │       │    │ 固定版本 ……     │        │
        └─────────────────┘       └────┴──▶ 关联／归并 ◀───────┘
```

以上名称仅作构图示例。每个输入输出来自保存接口，不按业务字段猜造。按组应用表现为groupBy→逐项call，不增加第三种调用模式。一个逐项call仍只画一个节点，不将N个运行实例展开成N个业务节点；运行中的总数/完成数读取真实nodeTotals/results，实例详情再进入已有运行检查。流水线内部定义通过当前固定版预览查看，关闭回到本层图。

整体依赖拓扑和调用实例数量分开：两路并行方法可以汇合；一个输入也可以供两条方法使用；call某路输出可直接绑定最终交付，另一路继续数据处理。端口集合自然承接该调用的已导出条目，只有需要重整数据时才增加汇合/归并节点，不能为了视觉凑满前后节点。

## 内部保持当前IR

不用新增“应用”节点类型、chain运算、容器运行器或第二套编排DSL。现有FlowNode.kind=call引用固定workId/definitionId，inputNames/outputNames为保存合同；mode/operation决定应用粒度：

- 整批：mode=all、operation=aggregate；每个具名端口的实际集合一次交给子Run。
- 逐项：mode=each、operation=map、call.eachPort明确逐项端口；该端口每条值触发一次子Run，其余输入端口按现有语义广播整批。
- 当前call不支持operation=flatMap。这里map表示调用分发粒度，不承诺每个子Run只导出一个值。子Run按具名输出导出条目集合；条目value里的数组不会因调用而自动展开一层。需要数组展开时使用已有明确数据步骤。

```json
{
  "id": "check",
  "kind": "call",
  "label": "核对调查范围",
  "mode": "each",
  "operation": "map",
  "call": {
    "workId": "saved-method-id",
    "definitionId": "fixed-definition-id",
    "inputNames": ["targets", "facts"],
    "outputNames": ["impact", "evidence"],
    "eachPort": "targets"
  }
}
```

此为字段示意。外层Definition.edges连接输入构造及call端口；Definition.outputs可直接指向[check, impact]，ItemUiPlan.views再绑定该输出。若需要归并，则根输出改为指向明确归并节点。根输出绑定不是新的计算节点，展示也不承担计算。

NodeResult.call保存实际workId/definitionId/runId；子Run继续使用同一调度器和父调用关系。定义应用节点、执行实例、业务工作项不混同；停止、等待、恢复及来源沿既有语义。按保存定义而非draft/adopted/latest解析方法，布局和折叠状态不进入语义定义。

## 组件与职责

WorkflowNode直接把call渲染为流水线应用，不再嵌套引用按钮卡；CompositionFlow仍按精确方法引用提供名称及固定版查看。实际节点选择与方法查看入口分清，避免查看方法时意外进入本项步骤编辑。现有WorkflowCanvas、MethodPreview、Button和运行检查复用；不增加UI组件库。

Assistant负责实际输入集合、调用粒度、方法选择、必要数据步骤、输出去向和业务界面声明。系统负责依真实call呈现方法身份/模式/端口、固定版查看及运行实例；不能要求模型编写另一份“这张图应该怎么画”的权威结构。

## 实施验收与边界

1. 一个call在画布中只有一层节点身份；名称、固定版和调用粒度可见，无内嵌应用卡片。
2. 实际两输入/多输出、串行及分叉汇合可读；逐项call保持一个节点并可看实际实例。
3. 直接输出绑定不补假汇合节点；真正数据变换显式表示，数组值与条目集合不混淆。
4. 精确固定旧版、缺失报错、查看往返及输入/Run不可变继续成立。
5. 两种桌面尺寸先看真实画面，再验证相邻图和运行语义；实施状态及实际验收见下方记录，不用历史截图替代当前画面。

## 用户补充：原语的可见性

逐项应用只决定调用分发粒度，不隐含模式匹配。方法已经导出多个具名端口时，外层edges直接连接各自去向；返回混合值时才用已有branch作条件分路。当前branch为matched/unmatched两路，复杂的expression.match是值变换，不能假称它自动创建多个路由端口。

展示名称从IR解析：call的each/all→逐项/整批应用，branch→条件分路，function collect/merge/join/groupBy→多路收集/合并集合/按键关联/分组；expression.match/reduce/map/flatMap/object等显示对应模式匹配/归约/逐项映射/展开集合/构造记录。业务label保留为本次用途，不作为语义权威。节点详情同样展示原语。

业务图始终显示真实端口名称（可采用同一定义的业务视图标签），输出直接绑定交付时标明“交付”；不增加假计算节点。执行进度可进入现成实例检查；匹配的两路需要用真实条件和端口验证，不仅检查文字存在。

## O当前实施与逐屏审阅

已完成单层流水线应用节点：真实方法名直接作为主标题，固定版次信息，原内嵌卡片删除；原语标签从core/definition.nodePrimitive读取实际kind/functionName/expression，节点和步骤详情共用。call显示逐项/整批应用，branch条件分路和expression.match模式匹配值变换分开，collect/groupBy/join/reduce等按既有IR呈现。业务label仅作不重复的本次用途，不用改名字伪造新语义。

业务图始终显示具名端口，根outputs的直接交付通过FileOutput图标及计划交付行体现；显示名来自同一定义的uiPlan/实际交付，Handle ID和edges不变。branch两路仍为matched/unmatched，已经导出的不同端口可直接连向各自后续；没有新增任意多分支pattern路由器。直接绑定输出不增加假计算节点。

一个逐项call保留一个图节点，实际nodeTotals/results进度可进入原RunInspector/RunInstancePicker看各次调用。固定定义查看及缺失错误继续使用MethodPreview，编辑/返回沿原工作区导航。没有新增节点运行类型、持久权威或执行器。

主代理实际看1440/1024：单调用节点、原语分路/汇合图、固定方法里的模式匹配，以及三次实例菜单。早期窄图字太小，改为业务节点220px/层间距64px及更清楚的标题/原语/端口字级；流水线编辑默认240/104不变。目标摘要压到一行，完整目标可查看；业务图去除无效的显示端口开关和重复分支边文字，端口保持可见。复杂图仍可缩放，不能把全图概览当作所有细节的唯一阅读尺度。更新memo依赖，使编辑/阅读切换的边标签跟随同一展示模式。

当前图以evidence/call-application的node-*、fixed-method-*、live-primitive-*、live-match-*、live-instances-*为准，较早primitive-dag-*保留独立fixture截图。脚本等待布局/fit完成并验证所有节点在画布内。live-result.json记录两尺寸无pageerror。N嵌套卡片及其旧截图不作为当前视觉依据。用户同意的是设计方向，最终视觉接受尚未声称。

### 验证分层

- pnpm typecheck:app及pnpm build通过；构建仍有既有大chunk提示。
- 布局/聚焦/视图状态/client模块19通过，layout-client-19.log；工作项工具/HTTP相邻模块8通过，tools-http-8.log。
- 固定版本及原语浏览器两尺寸共4通过，fixed-and-primitives-browser-4.log：旧保存版不替换为后续新草稿、缺失版本明确错误、单层名称、精确端口、条件两路、多路收集、共享输入及3次真实调用实例。
- 完整业务两尺寸及共用骨架3通过，adjacent-browser-3.log；两个固定方法具名端口串联的两尺寸检查1通过，named-chain-browser-1.log。分轮日志不冒称一次全历史套件。
- 新增primitive-display-fixture为合成记录P1/P2/P3：同一个eachPort逐项call产生3个子Run，共同facts端口广播；方法内expression.match按明确输入标记返回lane，外层branch分路，review得到P1/P3、ready得到P2，collect按两路收集。ready同时直接绑定根输出，未添加假收集节点。全部纯函数，无模型判断。
- 独立预览已安装同一明确合成演示，item=a60e11e5-a0a5-444d-8c24-31798a1337c6：实际HTTP执行1个根Run/3次调用并发布真实输出，仍open。实际浏览器随后只查看/整理布局，rootRuns和定义未变。原虚构告警演示仍3个根Run，本轮未对其重跑、补材料或确认条件。

Assistant指令同时纠正为“薄不强制单call”，明确必要输入构造/按项分发/分路/汇合可在本项，领域处理归公共方法；call仅map/aggregate，expression.match值变换与branch路由分开。工具合同/服务及运行语义均未改，8项相邻工具/HTTP通过。本轮没有重新验证真实模型自主规划质量，不借历史模型结果冒称本次新模型验收。

只重载独立4331以载入指令，事先检查4个独立预览工作项无活动Run或Assistant。托管4320/4321未停止/重启，原目录src未改，无提交/推送/部署。
