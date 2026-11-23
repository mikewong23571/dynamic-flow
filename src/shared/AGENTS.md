# 共享合同

共享只保存实际调用双方需要的记录、联合类型和纯函数；不import client/server，不建领域基类或schema平台。

| 入口 | 负责内容 | 调用方 |
| --- | --- | --- |
| records.ts | Work/WorkItem/Run/Definition、输入/结果/来源、模型目录、布局和运行记录 | 所有模块 |
| expressions.ts、node-ports.ts | 有限表达式及真实具名端口/集合输出语义 | flow/runs/作者/画布 |
| openui.ts | 官方OpenUI同源组件规范、原生程序检查、具名合并与只读记录声明 | Renderer及服务端保存/发布/作者 |
| workitem-composition.ts | ItemWorkspace、固定Delivery、方法能力和联合检查回执 | 工作项服务、HTTP、客户端 |
| workitem-conversations.ts、workitem-status.ts | 实际会话投影与业务/运行状态派生 | 客户端、工作项 |
| expansion.ts | 保存展开的执行图投影 | flow/runs/画布 |

当前合同见[唯一处理流程](../../docs/workitem-openui-flow.md)。WorkItem只有workId/inputBindings/deliveries/uiProgram一个当前权威；Work拥有方法版本/运行/对话，ownerItemId区分私有与公共。公共方法uiProgramTemplate只在明确复用时复制，不成为工作项当前安排的双写副本。

Run保存固定Definition、输入、materials、实例、等待、事件和来源；后续编辑不改旧输入。成功不自动业务结项。InputItem.source是固定输出引用，inputSource是失败补跑的固定输入引用，二者不能混用。Run.retrySource关联旧失败Run；旧Run保持原事实。

普通agent/function明确operation map/flatMap/aggregate；call用map/aggregate及eachPort/广播；集合与控制节点按自身确定语义执行。没有mode或resultOutput专用解释。输出schema表达数据合同，OpenUI程序安排展示/交互，不承担图执行。

OpenUI source是唯一当前可写界面。库schema/prompt和记录索引只读派生；Delivery只冻结实际数据源、程序版本及rowKey合同，不另存可写presentation。任意JSON正文不因sourceId/evidence等字段名成为业务证据；明确材料、进展和条件引用在业务服务校验。

改字段必须同步生产者、消费者、持久化及真实测试；类型相容不能证明含义一致。保留来源、preview/commit、输入修订、条件依据和当前/历史版本的区别；不增加兼容别名来消除类型错误。

模块验证按tests/AGENTS选择；当前唯一流程回归为workitem-unification.test.ts，OpenUI语法/渲染和模型/浏览器验证见当前track，历史计数不作为本次通过。

业务可见性纠偏：动态界面贯穿处理过程。read_inputs复用resolveItemInputs；read_children复用已有summary；read_output以本项明确Run和Definition读取阶段产物，与正式Delivery分开。Details/Metric/DataTable只组织真实数据，字段/标签由Assistant安排；现有Records/Report保留固定交付与业务动作。新验证入口tests/workitem-visibility.test.ts、tests/browser/workitem-visibility.spec.ts，实际模型质量与视觉边界见当前track。

页面组合合同：Section显式声明业务组，名称/内容由作者决定，默认边界与嵌套可访问标题由Renderer负责；相关数据、文字、表单及本组动作可混排，Stack仅布局，不推断分组。空Section标题继续兼容。Stack、Disclosure、Dialog与ActionButton的主次/禁用属性同源声明；@Each/数据函数使用官方SDK。组件的空title省略重复标题，表格selection与searchable显式开启工具。字段与对象身份仍来自实际数据及业务服务；详情/表单/布局组合不建立新的业务状态或领域页面。
