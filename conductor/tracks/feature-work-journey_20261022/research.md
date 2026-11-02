# 调研事实与原型取舍

2026-10-22。本轮阅读当前源码、原用户故事、生命周期合同和设计约定，并通过本地 Playwright 只读操作 4320 已运行环境。不是新功能验收，不代表本地服务与某个提交完全一致；源码与页面观察分别记录。未调用模型、提交表单或启动业务运行。

## 1. 已核实的断点

| 用户想做的事 | 当前页面／代码事实 | 最小必要改动 |
| --- | --- | --- |
| 不知道方法也先登记事情 | CreateItemDialog 强制编号／方法／条件；下拉默认第一条；独立 CreateWorkDialog 已支持目标、材料和进入 Assistant | 允许工作项无方法，接回现有方法生成，不新建生成器 |
| 启动时选择方法与输入 | WorkItemDetail 的“推进”直接 action('run')；items.launch 复制全部 materials；HTTP 只接受单入口正式运行 | 增加显式准备动作及请求参数，明确按实际入口分配输入 |
| 只处理选择的两条材料 | runtime 多处把 run.workItem.materials 传给 executeNode；只改 Run.inputs 还可能把全部材料作为上下文带入 | 一起固定本次选中材料与 Agent 上下文，不隐藏额外输入 |
| 用成果继续 | 工作项成果只有补证据／用于条件／比较；补证据把 source/label/outputs JSON 文本写进 materials | 直接引用所选输出作为本次输入，保留现有补证据作为另一种意图 |
| 跨方法沿用结果 | work.previewResults 只读单个 Work；sourceWorkItem 在当前 Work 查 sourceResultIds，同修订推导 | 新的明确来源按 work/run/result/port/item 解析，目标工作项显式传入；不使用源业务身份推断目标 |
| 试验后正式汇总 | ResumeDialog 选择一节点，创建 node scope；runs.start 仅 full/commit 才授予 commit | 在现有 full/node 范围内加入显式正式单步骤路径，同步所有业务报告守卫；旧试验仍 preview |
| 正式单步骤更新业务进展 | runs、assistant 与 work-items 都校验正式 full/commit，生命周期 handoff 同样规定 | 明确修订合同与调用双方，不简单把 preview 改名字；测试普通节点正式报告、试验不可报告、迟到报告拒绝 |
| 跨方法输入直接兼容 | CVE A 的 materials 输出是对象；B 的 inputContracts 和首节点 inputSchema 仅接收 string | 先给用户真实不匹配提示；通过现有方法编辑调整 B 后再交接，不内置 CVE 转换 |
| 阅读成果而不是步骤名 | finalArtifacts 取节点 label 作标题；definition.outputs 已有明确最终输出端口映射 | 利用现有输出映射表达内容名／来源步骤，不靠节点名或 JSON 字段猜业务关系 |
| 逐步明确完成条件 | server criteria 要求条数与 ID 集合不变，页面只能修改 met/evidence | 最小增加条件定义编辑，改文案重置该条确认；旧运行与结项记录保留 |

主要入口：[创建](../../../src/client/features/work-items/WorkItemDialogs.tsx)、[工作项动作](../../../src/client/features/work-items/WorkItemDetail.tsx)、[业务模块](../../../src/server/work-items/index.ts)、[HTTP](../../../src/server/index.ts)、[结果选择](../../../src/server/work/index.ts)、[运行器](../../../src/server/runs/index.ts)、[续做对话框](../../../src/client/features/workspace/ResumeDialog.tsx)、[方法创建](../../../src/client/features/workspace/CreateWorkDialog.tsx)、[controller](../../../src/client/app/controller.ts)、[Agent](../../../src/server/assistant/index.ts)、[成果投影](../../../src/client/features/results/result-overview-model.ts)、[CVE B](../../../pipelines/cve/business-impact-v1.json)。

## 2. 页面实看

[脚本](evidence/inspect.cjs)仅允许 API GET/HEAD；最终[观察记录](evidence/current-observations.json)记录无写请求、无 pageerror。实际打开创建表单、工作项详情、历史已完成轮次、更换方法对话框、方法的过程检查和结果总览。

- [创建表单](evidence/current-create.png)：业务编号、目标、方法、条件必填，默认方法来自列表。首次观察曾在方法列表尚未加载时捕获“请先创建方法”，最终脚本等待选项加载后再截图；不能把瞬时加载态当成确实无方法。
- [工作项与成果动作](evidence/current-item.png)：启动入口只有“推进工作项”，方法修改在“目标与处理方法”内；成果有补为证据／用于条件／比较，没有本次输入或下一方法选择。
- [换方法](evidence/current-method.png)：独立保存动作，不是本次执行配置的一部分。
- [结果总览](evidence/current-results.png)：以工作项分组展示方法运行；独立执行与业务事项混在同类行中，需要按本 track 的职责收敛。
- 当前真实工作项有第 4 轮失败与第 3 轮已完成；选旧轮次时顶端业务概览仍描述最新执行。新页面需明确“当前业务状态”和“所看历史运行”，不能把上次截图的数据状态当成稳定前提。本轮没有分析或修改业务失败原因。

本轮人工查看创建、工作项与成果、换方法和结果总览截图。脚本第一次改为选择旧轮次时因可访问名称的空白匹配过严超时，修正定位后完成；没有业务提交、重复运行或数据恢复动作。

## 3. 复杂度与耦合的取舍

| 需要解决的真实问题 | 采用 | 不采用及原因 |
| --- | --- | --- |
| 两处入口准备同一类执行 | 一个普通受控业务组合组件＋明确请求 | 通用向导／页面 DSL，无需求 |
| 来源跨方法且需要回看 | 沿现有记录补足明确来源引用、直接按引用读文件 | 全局成果服务／索引／复制结果，不需要 |
| 成果值和来源一起进入新运行 | 服务端从选定源解析，Run 固定值；旧引用兼容 | 自动复制为文本证据，丢失类型与用途边界 |
| 局部改进后正式做一段工作 | 静态 Agent／Function 单步骤正式处理，沿用 node scope；多步骤用 full 方法 | 任意子图续跑与缓存调度会扩张执行器，简单汇总故事不需要 |
| 正常材料的不同版本去重 | 识别明确同一源输出和同一样本的候选版本，保留用户选择 | 用材料 ID 全局去重；不同 Work 都可能有 M01，正常汇总也共享来源 |
| 跨类型交接 | 现有输入合同校验＋已有编辑路径 | 自动适配器、CVE 字段转换或“全转字符串”，隐藏不匹配 |
| 新业务起步 | 可空方法／条件、按需生成并返回 | 必须先建流程或固定模板，也不新增主 Agent 自动规划多个方法 |
| 可读成果名称 | 最小输出展示元信息／已有输出名称，所有作者入口一致 | CVE 专属“材料与报告”分类或猜测字段命名 |
| 旧数据兼容 | 新字段可选，历史只读，旧 API 明确保留默认 | 数据迁移工程、自动改写所有历史记录 |

不因避免抽象而复制两套启动逻辑，也不因复用而把创建、等待事件、成果比较塞进同一个万能表单。新共享类型只覆盖本 track 的实际输入和交接双方。

## 4. 最小接口意图（实施前按源码冻结字段）

- 启动请求：目标 itemId（正式）＋workId＋definitionId＋full 或 nodeId＋各入口下有序的材料／成果选择。材料用当前工作项内身份；成果用来源定位加端口／输出项。用户无需看到内部 ID。
- 来源解析：读取真实保存的输出，检查选择存在、类型和范围；不得信任浏览器上传一个值再附伪来源。新 Run 保存实际输入，后续源读取失败不妨碍读到已冻结值，但来源跳转要如实失败。
- 业务快照：固定目标与本次明确上下文；只把选中材料交给本次执行，累计材料留在工作项。明确传入的目标工作项不等于源成果的工作项。
- 启动与方法选择：完成前置检查后再启动并记录本次方法；保留现有串行和启动恢复机制，不追加跨模块事务框架。失败不能在页面宣称已运行，也不能暗中变更用户下一次默认选择。
- 正式单步：只由工作项明确动作授权，校验节点存在及本轮支持的种类；现有直接 run/试验/比较/重试不因为输入带工作项来源而获得 commit。进展写入继续要求真实活动实例、当前运行、未停止和来源匹配。
- Assistant 形成方法：将用户明确的目标与材料作为本次编辑上下文，不自动重写共用 Work 的样例材料，也不从聊天隐式提取执行输入。已有模型循环与 update_flow 保持。

本轮未冻结新字段拼写或提前创建 service 接口；实现按最小调用链落地，不为将来扩展增加泛型注册表。

## 5. 验证资产与边界

可复用 tests/work-items.test.ts、lifecycle-integration.test.ts、lifecycle-runtime.test.ts、workitem-progress.test.ts、runs.test.ts、trials.test.ts；浏览器 workitems、workitem-workspace、workspace 和 semantic-workflow 的私有 HTTP/runtime fixture。见[测试地图](../../../tests/AGENTS.md)。

新增验收只覆盖实际改变的行为：精确输入（包括 Agent 上下文）、跨方法引用、独立正式单步与 preview 边界、创建无方法、逐步完善条件、两个方向返回。无需为纯文案／布局写镜像单元测试。

本轮没有运行模块测试或真实模型，因为尚未改代码。历史通过数量不继承到新 track。外部成熟产品／库选型不是本轮问题，不新增库，不以品牌参考替代真实页面研究。
