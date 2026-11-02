# 工作项业务界面共编

当前合同见[唯一流程与OpenUI](workitem-openui-flow.md)，实施与真实验收见[当前track](../conductor/tracks/overall-design-workitem-openui_20261030/index.md)。

## 系统与Assistant的职责

先遵循[系统准则](workitem-system-principles.md)：应用提供稳定事实、命令和组合能力，Assistant按实际业务组织处理与阅读/参与方式。技术对象及工具分类不直接决定页面结构；不能由应用预写每种领域界面，再让Assistant复制。

## 一份原生程序

WorkItem.uiProgram的id/definitionId/source是唯一当前可写安排。人和Assistant修改同一份原生OpenUI Lang；官方组件库、parser、mergeStatements和Renderer处理语法、引用、增量合并、状态及展示。没有ItemUiPlan可写副本、json-render Spec或自建语言解释器。

组件库和prompt/schema同源，具体组件以shared/openui和客户端features/openui为准。库封装现有控件与业务阅读器；程序安排阅读、输入和动作，不保存伪造成果或执行业务图。

## 保存及版本

- 具名块补丁合并为完整source后验证；保存携带工作项修订及原programId，错误定位声明，冲突保留草稿。流式容错预览不表示可保存。
- 保存回执不能覆盖请求发出后的新编辑；后续编辑只推进正确基线。改变展示不启动Run或修改输入/条件。
- 纯标签/布局改动重绑同一固定数据身份，选择/阅读状态保留；output、rowKey或真实交付换版产生新身份，旧选择/关联草稿清除。
- 程序旧版本和交付元数据进入只读历史。公共方法模板只在明确复用时复制为本项程序，此后不跟随或双写。

## 数据和动作

Query只接读工具；写工具只能作为Mutation由明确用户操作触发。未保存草稿及历史消息预览没有写工具。挂载、轮询、改标签和刷新不能启动业务。

记录组件声明output及顶层rowKey，服务端从保存程序派生合同，校验实际唯一非空字符串ID并冻结到交付。客户端只交deliveryId/recordIds，服务端重读真实值与来源。表单在首编辑捕获基线；轮询不能把旧草稿包装为最新修订，失败保留输入并可明确重新读取后重试。

人、Pi和OpenUI调用同一prepare/run/输入/交付/条件服务。@ToAssistant进入当前会话并带实际焦点；普通阅读不调用模型。表单不是持久wait；业务等待仍由RunWait和明确事件推进。

## 过程与验收

固定应用骨架始终提供处理过程；无界面/无交付也能查看计划和实际Run、内部方法、步骤/实例、固定输入输出、错误和来源。OpenUI不能用文本或浏览器变量替代这些事实。

工作项结项使用实际条件和依据，Run成功、界面生成及review动作都不自动结项。测试入口为tests/openui、workitem-unification、workitem-composition-backend、workspace-check及browser/openui-*；当前数量和真实模型限制写track，不复制历史通过记录。

## 全过程业务观察与参与

动态界面由Assistant按当前工作安排，贯穿已有资料、业务推进与最终交付。不是固定仪表盘，也不只是在Run成功后格式化JSON。使用read_workspace读取本项stage/summary/blocker/nextAction/execution；read_inputs复用执行输入解析读取当前明确绑定；read_children复用已有分页及scopeSummary；read_output读取明确Run的真实阶段产物，尚未发布也可观察；Records/Report继续读取明确的固定交付。

Details按业务标签显示真实字段，Metric显示事实中的数值，DataTable显示实际清单、详情及可选来源。字段与组织方式来自同一原生程序，应用不枚举领域。Query使用原生正数自动刷新；数据变化不需要重写程序或清除未提交表单。输入/输出读取分页，不能把当前页计数标成业务总数；未执行与0条业务对象不同。TextContent用于必要解释，不保存会变化的阶段、统计、缺口副本。

补充输入可以在旧Run运行/等待时保存，供后续明确执行使用；不会改写旧Run。应用只在业务写入进行中禁用表单，不用“有运行”禁用整个动态区域。Run的signal/resume和新输入后重跑仍是不同命令。

## 页面能力与边界（2026-11-02）

原生Stack组合内容，Disclosure按需展开，Dialog通过$open打开任务；配合SDK的@Each和@Set，可从某条实际记录准备$draft，在同一个InputForm中提交补充，不需要预设领域页面。表单仍按固定输入合同校验，选择/打开/编辑只是本地状态，提交才调用原命令。失败停留在当前任务并保留草稿，成功后可明确刷新或继续。

ActionButton提供primary/secondary/quiet和实时disabled；内容/表单的空标题表示由所属区域命名。DataTable/Records只有显式绑定selection才提供勾选，最后的searchable参数为true才显示搜索。表格与统计并非默认页面框架，Assistant可根据任务采用记录组合、详情或其它已有构件。

工作主区容纳处理中内容与结果，名称为“工作”；固定执行、保留本轮成果和界面安排位于工作项更多菜单，过程/输入/记录仍固定可达。保留固定成果仅对有对应输出声明的成功正式运行可用；查看阶段结果不要求先保留。变更外壳不改业务命令或旧运行，也不自动重写已有保存的程序。

## 前端布局责任

Assistant决定内容、分组与显式横纵组合，组件负责基础排版。ViewNavigation分开导航和内容，View/Workspace排列主要区块，Section组织标题与正文，Stack组织局部内容；表格、详情和表单只管理自身内容，不携带页面外边距。排版实现归OpenUIWorkspace.css与对应适配器，尺寸约定见前端控件README。改变某个业务字段或子组件类型不应意外改变其父容器布局；不依赖CSS猜测业务结构。
