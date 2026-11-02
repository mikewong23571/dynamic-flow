# 源码调研：事实、缺口与最小落点

日期：2026-10-23。只读源码核查，未运行本轮功能测试或真实模型；历史测试名称仅用于选择后续回归。当前工作区包含大量既有未提交改动，调研基于当前文件而非仅HEAD。工作项字段、调用双方和现行合同优先于旧故事的“尚未实现”描述。

## 1. 已经存在的基础

| 核查入口 | 当前事实 | 本track取舍 |
| --- | --- | --- |
| [records](../../../src/shared/records.ts)、[create](../../../src/server/work-items/index.ts) | WorkItem有稳定身份、data、文本materials、条件、历史、跨方法runs；无父子字段。无方法/无条件可创建 | 不重做创建流程，不加聚合/执行类型；可选增加关系和结构化交接 |
| [CreateItemDialog](../../../src/client/features/work-items/WorkItemDialogs.tsx) | 标题/目标必填；编号、方法、条件可选；初始证据为文本输入，不是工作项文件上传 | 初版故事用粘贴报告或已有解析成果；不声称原生工作项上传已存在，不新增文件平台 |
| [PrepareItemRun](../../../src/client/features/work-items/PrepareItemRun.tsx) | 已有方法/保存版本/full或静态单步/分端口选择；单入口默认initialSources，否则全部文本材料；多入口初始为空 | 复用该准备入口，增加明确交接输入和同方法继续默认；不为批量复制1000个Dialog |
| [run-inputs](../../../src/server/work-items/run-inputs.ts) | 服务端从真实成果解析JSON，固定来源；强制run.workItem.id为当前项；材料ID为局部M01 | 扩展为明确交接来源，保持JSON；补跨项同名材料ID不混淆验证 |
| [launch](../../../src/server/work-items/index.ts) → [HTTP run](../../../src/server/index.ts) | launch先检查至少一份文本材料，之后才调用显式输入解析；context仅从当次冻结数据构建 | 纯结构化交接/纯成果输入必须能启动，不能塞假文本绕过；无参数旧调用保留原语义 |
| [runs owner/start](../../../src/server/runs/index.ts) | occupied按item:id隔离，非工作项按work:id；不同工作项可共用方法同时运行 | 不复制方法、不重造runtime；批量调度只组合普通启动与现有等待结果 |
| [complete/reopen](../../../src/server/work-items/index.ts) | 完成检查条件与闲置、将criteria复制到completed历史；重开清met保留证据 | 增加子项范围约束及已确认子项快照，不另建结论发布流程 |

## 2. 真实缺口与反例

| 缺口及触发输入 | 当前行为／失效假设 | 最小变更与受影响故事 |
| --- | --- | --- |
| 子项只有父项输出，无自己的文本证据 | launch文本空检查先失败；简单放开跨项result筛选仍不能运行 | received输入+服务端统一准备入口；故事2/3 |
| 父项M01与子项M01内容不同 | resolveItemInputs按材料id合并，来源冲突或误关联风险；当前同项约束掩盖此问题 | 保存来源所属项/Run，运行内显式命名空间化原文ID；故事2/3，不能放开全部跨项成果 |
| 一个NodeResult同端口多项或多端口输出 | OutputReference有port/index，但CriterionReference只保存resultId，WorkItemDetail.useArtifact(run)一次选整个result全部输出 | 条件引用和从成果拆分都扩到精确输出项，不能用第N项UI标签代替真实定位；故事3/4 |
| 已有两个仓库结果要建立子项 | 当前没有候选格式、建立动作、关联反馈，不能从任意JSON猜目标 | Agent输出明确候选，统一手工/自动建立动作；故事2/3 |
| 日常重跑相同扫描报告 | 仅建立动作ID去重无法关联下一Run中的同一问题 | 同父trackingKey+source关联；允许人工关联，不做语义模糊合并；故事2 |
| 季度→target→仓库的待办 | WorkItems只有一个itemId和返回总列表，无父项或跨层查询；WorkItemDetail按key卸载导致父项本地草稿丢失 | 轻量位置栈/每项本地草稿恢复，直属/后代待办；故事1/5 |
| 父项结项与子项新增交错 | 当前仅单项serial，complete无子项校验 | 层级变更串行和先重开再新增的顺序；普通业务错误可重试，不建事务平台；故事1/6 |
| 1000项列表 | list=all→Promise.all(view)，view读取每项关联方法整个work.json；前端全量接收再slice且每2秒轮询 | 后端摘要/范围筛选/分页，按方法复用一次读取或缓存；不向列表返回history/materials/results；故事5 |
| 当前方法可能已有1000个Run | files.read全量JSON，flow.snapshot读取全部定义和运行；useItemSnapshots按item.runs的methodIds请求整份快照 | 规模验证必须包含历史成果，必要时增加只读指定Run检查接口；编辑快照保持，不先拆存储；故事5 |
| 默认汇总最新输出 | 当前没有被接受成果视图；completed历史只有条件及result级引用 | 使用固定完成事件与精确来源，不读取当前summary冒充结论；故事4 |
| 无文字完成条件的纯父项 | 现有complete拒绝空criteria | 添加结构性“有效范围子项已完成”依据作为父项完成基础，仍显式确认；有独立条件继续检查，不强迫用户写空洞条件；故事4 |

## 3. 需要同步的真实调用链

- 工作项创建/补证/启动：`WorkItemDialogs`、`WorkItemMaterials`、`PrepareItemRun`、`ItemInputChoices` → `server/index` → work-items与run-inputs → runs.start。
- 工作项列表：`WorkItems` → GET /api/items → list/view；[Results](../../../src/client/features/results/Results.tsx)也读取同一列表做关联，改分页时不能只改WorkItems，否则方法页会漏关联。新调用方显式请求范围/ids/摘要，旧无分页路径保持兼容并记录限制。
- 成果引用：`RunInspector` / [run-inspector-model](../../../src/client/features/results/run-inspector-model.ts) → `WorkItemExecution/WorkItemArtifact/WorkItemCriteria`；来自独立成果页的定位本来有result/port/index，应沿用。
- 历史/导航：`WorkItems`本地itemId、`WorkItemDetail`本地tab/criteria/scroll → App保留工作项宿主 → RunFocus进入方法；子项导航不能破坏已有跨方法返回与草稿。
- 自动建项：建议增加专用`create-items`节点，沿已有milestone hook接work-items业务动作。同步[FlowNode](../../../src/shared/records.ts)、[node-ports](../../../src/shared/node-ports.ts)、[flow校验](../../../src/server/flow/index.ts)、[runtime](../../../src/server/runs/index.ts)、[作者schema/指引](../../../src/server/assistant/index.ts)、[CanvasPane](../../../src/client/app/CanvasPane.tsx)、[useActions](../../../src/client/state/useActions.ts)、[NodeInspector](../../../src/client/features/inspector/NodeInspector.tsx)、[WorkflowNode](../../../src/client/features/canvas/WorkflowNode.tsx)。不塞进Agent任意HTTP调用，不让普通数组自动写业务状态。
- 文件：`files.change`按方法串行整文件写；work-items自己保存单项JSON。两个存储不迁移为一个巨大父项文件，也不改历史Run归属。

## 4. 独立审查补充的源码事实

- runs.retry固定node/preview，不能直接用于create-items的正式补建；回执增加基于原候选来源的业务重试，普通试验边界不变。
- result-overview-model.runLabel依赖item.runs跨方法顺序；列表分页后的关联摘要要保留序号，避免只显示当前方法内的轮次。
- create每次all扫描业务key，批量建立不能循环1000次独立全量扫描；同一批读取/构建查找一次，逐项保存结果。
- Run窗口不限制一个Run中所有节点的并行模型请求；容量验收分别记录，不承诺全局模型硬限制。

## 5. 可直接复用的测试与约束

- `tests/work-items.test.ts`：业务身份、完成历史、关联恢复；新增树/范围/结项反例使用临时真实文件。
- `tests/lifecycle-integration.test.ts`：同方法不同工作项、明确输入、跨方法JSON引用、空方法创建、单步正式处理、条件/重开；新增received与completion输入从真实HTTP贯通。
- `tests/workitem-progress.test.ts`：全局统计、同方法并行两个项、preview与迟到业务写入边界。
- `tests/runs.test.ts`、`tests/lifecycle-runtime.test.ts`：停止、失败部分结果、恢复；新节点按需增量，不改普通运行口径。
- `tests/browser/work-journey.spec.ts`、`workitem-workspace.spec.ts`：已有私有HTTP服务/临时数据、两尺寸、输入/草稿/来源返回；新故事复用fixture模式。
- 设计与控件沿用client/DESIGN-NOTES、components/ui/README，Table/NativeSelect/Dialog/ArtifactValue/RunInspector均可复用；不引入树组件或新UI库。

## 6. 后续逻辑审查补充

- 当前validateInvocation对缺ref的对象加文本说明仍报错；完整对象才通过。输入修订必须替换对应条目，不能仅追加证据。已运行只读常量[schema探针](evidence/schema-probe.jsonl)，没有运行任何实际工作项。
- InputItem.sourceResultIds不是精确OutputReference。自动建项使用首次持久化的NodeResult.input引用；恢复/补建复用它，不从上游值相等猜端口和位置。
- 原未终结Run占窗规则已撤回。waiting/interrupted释放新启动名额，既有恢复优先，恢复后按活动数暂停新提交；阈值不保证硬并发上限。实际调度仍待Phase5验证。

## 7. 原调研未做

没有运行模型、修改真实数据、启动浏览器验收或跑业务测试；源码调研不证明容量或交互已通过。原稿中的上传操作不能照搬为当前能力；本track使用现有文本/解析成果交接，原始文件可走既有方法上传剖析，原生工作项附件上传留在范围外。候选条目、批量输入和自动建项属于本track要新增的行为。
