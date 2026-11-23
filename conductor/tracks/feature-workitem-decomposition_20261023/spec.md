# 工作项分治、材料接续与整体收尾

状态：整个track已实施并完成相关验收，证据与未测边界见[evidence.md](evidence.md)。产品基线为[修订设计](design.md)，具体承载以[实施设计](implementation.md)为准；不把原/tmp讨论当作当前已实现合同。

## 目标

用户能够带着一个问题开始，在开始或处理中拆出需要独立推进的子问题；材料自动接续；从整体范围找到实际待办；分别处理后依据确认过的结论收尾。以[连续页面故事](acceptance.md)逐条验收，代码结构或字段存在不代表通过。

1. 创建无需预判聚合/执行；工作项可以随时建立子项，保留原运行与成果。
2. 手工、Agent清单与方法中明确配置的自动建立共用业务动作，已建立反馈持久，普通重跑能明确关联已有项。
3. 子项收到明确材料和精确成果来源，默认准备本次输入；只向用户追问缺项和歧义，不要求反复配置端口/版本引用。补结构字段修订对应输入，追加证据单独处理，旧快照不变。
4. 父项范围可查跨层待办；批量准备/处理有逐项结果，部分失败可继续，列表/详情不全量渲染历史。
5. 完成沿用条件与固定依据；父项不强制跑汇总，必要汇总默认用确认记录。范围排除、重开、新增子项保持状态一致。
6. 1000叶子、多层和有运行历史的私有样例验证规模能力及操作成本；小规模通过不冒充千项通过。

## 非目标

- 不新增聚合/执行持久类型，不建并列事项实体、多父关系、自由任务图、通用调度器、生产权限或事务框架。
- 不把节点或普通数组自动变成工作项；Agent不自行调用应用HTTP写业务身份。
- 不改旧Run归属、固定输入、旧完成记录，不把模型输出直接标成业务完成。
- 不做任意JSON字段映射平台、隐式语义去重、自动选最新结果为结论；稳定key以明确方法合同为准。
- 不新建原生工作项附件上传/对象存储。先用文本报告、已有解析成果；需要原始文件时复用既有方法上传剖析。
- 不承诺无人值守递归执行全部子项或关闭页面后继续启动尚未提交的批次；已启动Run照旧独立执行。
- 用户已授权实施本spec应用改动；不修改或清理真实业务数据，不改模型设置，不提交/push。

## 改动点

单仓dynamic-flow，沿用现有工作区与conductor/tracks；本次repo_scope=null。大目录用于标明责任，实施每阶段只改对应故事所需文件，不全目录重构。

| 模块/路径 | 具体改动 | 保留/复用 |
| --- | --- | --- |
| src/shared/records.ts | 父子/范围/候选/received输入/完成引用/摘要查询合同及create-items节点 | Work、WorkItem、Run、Definition边界和旧字段兼容 |
| src/server/work-items/index.ts、run-inputs.ts；必要children.ts/queries.ts | 关系与范围、建立/关联、输入准备、完成快照、批量摘要/操作 | 当前保存、历史、条件和启动语义；不堆进一个巨文件 |
| src/server/index.ts | 新actions/prepare/范围与分页查询、runtime hook；提取复用单项启动接线 | Hono单进程模块直接调用、现有响应错误 |
| src/server/runs/index.ts、flow/index.ts、shared/node-ports.ts、assistant/index.ts | 明确create-items节点的校验/执行/preview/作者合同 | DAG、Pi、来源、停止/恢复和已有schema校验 |
| src/client/features/work-items/* | 子项/待办列表、位置栈、清单、材料预填、批量准备、条件与整体确认 | WorkItems/Detail/PrepareItemRun/Criteria、Management和现有控件 |
| src/client/features/results/{run-inspector-model,RunArtifact,RunInspector,Results,RunArtifactsPage,result-overview-model}.tsx或对应ts、WorkItemExecution/Artifact | 精确输出选择与拆分入口、来源查看、摘要关联查询同步 | 共享阅读组件和当前成果页布局；不全站视觉改造 |
| src/client/app/CanvasPane.tsx、state/useActions.ts、state/useDraft.ts、features/inspector/NodeInspector.tsx、canvas/WorkflowNode.tsx | 新业务节点的创建/配置/显示 | 现成画布和控件；不复制第二套方法编辑入口 |
| server/files与flow.snapshot（仅规模证据需要时）、useItemSnapshots | 针对选定Run的只读检查，减少全量快照 | 不预先拆数据目录或迁移数据库，编辑快照保持 |
| tests、docs/workitem-stories.md、docs/design.md、docs/implementation-map.md、最近AGENTS | 同步实际合同、阶段故事与有意义回归 | 旧H1–H11/L1–L5/T1–T8边界，分期证据 |

## 影响域

- 生命周期：complete/reopen/add-child/scope要协调；有效范围/历史明确分开。纯父项不用写空洞条件，但仍需显式确认。
- 输入来源：从“同项历史”扩至“明确交接”；文本/JSON均保持原值，跨项M01不冲突，旧引用不伪造port/index。
- 查询：GET /api/items现有全局summary、Results关联调用都要兼容；新增摘要/分页不能静默漏项。
- 方法语义：create-items是明确新节点，首次业务写入前固定节点输入来源，恢复/补建复用同一候选；需同步画布、作者、校验和runtime，preview不得写工作项。普通动态规划不隐式扩大业务写入能力。
- 界面：父子返回保留筛选、草稿和读位；千项只载摘要，不常驻1000详情；基于页面任务设计，不添加解释性段落替代操作。
- 验证：每阶段只跑相关模块/私有HTTP/两尺寸浏览器；真实模型小样另记，1000条用明确fixture，不能触发千次真实模型调用。

## 原型取舍

分五阶段推进，每步能独立服务用户；自动建项和规模阶段可后到，但未完成阶段保留TODO。批次新启动阈值、只读Run快照优化等由实际数据证据确定最小实现；等待/中断不占新启动名额，恢复沿用现有语义并重算活动数，暂缓超阈值时的新提交，不承诺硬并发上限，不引入不存在的抽象。偏离本spec的业务语义或扩大模块范围时先记录具体反例并更新设计，不以“兜底”扩大目标。


## 实施反例与最小范围修订

- 新节点两尺寸验收中，初始布局快照与“添加步骤”相遇，旧dirty=false effect可能覆盖刚编辑的本地定义，节点选择消失。故事4受影响；将useDraft的同步编辑标识纳入最小修正，保留原编辑/保存/放弃语义，以添加节点遇到布局保存后仍可配置并保存验证。
- 62MB历史方法的首次冷列表实测UI约2.52–2.66秒，热首屏0.38–0.43秒，筛选/返回均约0.1–0.16秒。重复扫描/解析已修正；不把剩余冷读取成本转嫁为每次保存的额外副本。本特定规模样本冷首屏预算调整为3秒，热首屏/筛选2秒、热返回1秒保持。原2秒建议、超预算实测和理由均保留，未来持续增长再按实际瓶颈处理。
