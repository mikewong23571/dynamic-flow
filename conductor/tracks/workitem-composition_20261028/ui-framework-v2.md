# 工作项页面框架重建方案

> 当前状态：历史方案/阶段记录，用户后续否定其页面设计，已被当前 spec.md、workflow.md、plan.md 取代。文内“确认/通过”仅表示当时内部判断或技术检查，不能作为当前设计通过或继续编码的依据。

2026-10-28。状态：审计完成，root 已确认整体框架并授权 UI agent 实施；不再等待额外用户确认。范围包含此前工作项列表、创建、详情、材料、子项、验收与跟进界面，不以本轮 composition 旧布局为兼容要求。保留服务端、runtime、真实来源和业务能力。

## 实际来源与判断

已读根/src/client AGENTS、DESIGN-NOTES、ui/README、App、WorkspaceHeader、WorkspaceTabs、ContextPanel、CanvasPane、Management、Assistant，以及 WorkItems/CreateItemDialog、CompositionInputs/Flow/Acceptance、MaterialCard/MaterialDialog、ItemRelations、旧 Plan/Progress/Criteria/History/Acceptance/Execution 等调用关系。产品依据为 meta application design、meta implementation research、本 track spec/decisions/acceptance，以及 H1–H11、分治与阶段接续合同。

对独立 4330 页面进行了真实浏览器只读操作，1440×900 和 1024×768 的来源截图在 [evidence/ui-framework-v2](evidence/ui-framework-v2/)。没有操作托管 4320/4321，没有写测试业务数据。kimi-webbridge 因扩展未连接无法使用；截图由本工作区 Playwright Chromium 读取独立页面。截图已经打开查看，不以组件名代替视觉审计。

实际观察：

- 列表有完整管理页骨架，但八个状态计数、状态下拉与“当前匹配”重复占用多行；一条记录同时出现“待复核/待处理/已完成”，需要明确业务和执行的责任。
- 详情在标题前铺编号、进行中、待处理；长目标另占行；再铺本轮已完成状态条；标题行的运行和状态条的整理交付均抢主动作。
- 1440 右侧 Assistant 消息很长时，当前页面截图没有露出 Composer。模型会话入口已经存在，却未保证“进入就能输入”。1024 默认只有一个 Assistant 按钮，缺少直接输入入口。
- 输入页同一个上传文件在文件 chip、raw JSON 摘要材料卡、接续输入标题中出现三次；文件 chip 没有正文动作。材料的身份、内容和本轮采用关系没有分清。
- 方法工作区的可复用价值在固定页头/导航/主内容/辅助面板的节奏、真实 Assistant 和共享运行检查器；其运行版本、样本、试跑与候选动作属于 Work，不属于工作项外壳。
- 当前 Detail 只接 composition，旧子项/跟进等组件在源码中存在但未接入当前页面，不能据此认为能力路线还在。

## 页面层级

继续使用 App 的 Sidebar 和 workspace 容器。WorkItems 是业务入口，Detail 在同一主区占满剩余宽高；返回保留列表查询、页码、滚动、工作项局部草稿。新页面不建立新的全站路由/页面 DSL，不挪动底层 Work/Run/Definition 边界。

```text
Sidebar  | 工作项标题 · 一个业务状态                 目标详情 / 更多
         | 成果   流程   输入   记录                完成条件
         | --------------------------------------| Assistant
         | 当前任务工具行                        | 当前关注
         |                                       | Thread（自身滚动）
         | 主内容（表格/图/输入行/记录）           |
         |                                       | Composer（始终可见）
```

页头高 68–76px，主导航高 46–48px；页内边距1440为24–28px、1024为20–24px。内容区 `flex:1; min-width:0; min-height:0`。只有主 Tab 内容区、会话 Thread 和确有必要的表格局部容器滚动；页头、导航、Composer 不随长正文离开视口。首版无需可拖面板或统一页面配置模型。

## 每一处信息与动作只承担一件事

| 区块 | 责任 | 常显 | 动作与不放什么 |
| --- | --- | --- | --- |
| 页头 | 当前业务身份 | 返回、标题、一个统一业务状态 | 目标详情打开现有 Dialog；编号与完整目标放详情，更多收低频动作。不放本轮运行按钮和独立 stage pill |
| 主导航 | 当前阅读/操作位置 | 成果、流程、输入、记录；固定完成条件入口 | 不把同一执行成功复制成整页横条 |
| 成果 | 当前明确交付、实际内容、来源与下一步 | 视图名称/切换、时间、表格或报告 | 搜索与选择就近；已选时出现“继续处理”；无交付但有成功 Run 时在本任务面提供“整理成果” |
| 流程 | 保存定义、真实执行、步骤修改 | 保存状态、一次运行/停止/恢复入口、画布 | 选步骤才打开配置；成功/失败/等待在本工具行和图中出现，不再外置完整状态条 |
| 输入 | 材料身份、内容、采用与修订 | 一张紧凑输入清单、来源/表示/本轮采用情况 | 上传/补材料/填写声明字段；正文进 MaterialDialog 或现有 ArtifactValue 阅读任务面，不在清单铺 JSON |
| 记录 | 实际历史与固定运行 | 时间、事件摘要、来源入口 | 展开才创建旧正文，旧 Run 通过 RunInspector 检查 |
| 完成条件任务 | 逐项定义/依据/确认与结项 | 导航固定入口显示真实已核对数 | Dialog 内保存、确认、结项、重开；不在成果下方再铺一份常驻大表单 |
| Assistant | 用户直接表达意图并持续协作 | 真实 Composer、模型、发送/停止；展开时 Thread | 同一 Assistant/Runtime/Thread/Composer；不造新聊天，不只保留“打开Assistant”按钮 |

页头业务状态用统一 `itemStatusLabel`/Badge；阶段如果有明确业务意义，在实际进展/记录中显示，不将“待处理”与派生业务状态并排重复。业务运行结束与人工结项始终分开。

## 两种尺寸与 Assistant

1440：Sidebar沿用现有约216px，剩余1224px。Assistant默认360px并排，主内容约864px；需要完整表格时可收起会话为底部 Composer 停靠，主内容取得全部宽度。Assistant 顶部仅标题/关注上下文/收起操作，不重复工作项长标题与“未指定样本”。

1024：Sidebar沿用现有约192px，主内容约832px。默认展示底部真实 Composer 停靠，约116–148px；保留2行输入与现有模型/发送行为。会话展开为主区内右侧覆盖层（约380–420px，带关闭，不能压缩表格），用户收起后继续保留可输入 Composer。发送时展开会话以显示真实工具与回应。不是默认覆盖整块内容，也不是孤立打开按钮。

同一挂载的 Assistant 只切 presentation（完整会话 / composer），不复制消息/草稿/提交逻辑；Composer与runtime保持同一身份，不能切布局就丢光标、IME或未发送输入。`Assistant`允许的最小适配是显式工作项上下文、placeholder与presentation，原方法页默认行为保持。完整模式要求 chat viewport `min-height:0`，composer `flex-shrink:0`，长消息不会把输入框推出视口。

## 空、进行中、失败与结束

| 现场 | 主视图与反馈 | 下一步 |
| --- | --- | --- |
| 新工作项，无流程 | 流程空态只展示当前需求和已有材料短列表；Assistant直接可输入 | 上传/补材料或直接描述意图；不自动发送固定长prompt |
| 有保存流程、尚未执行 | 实际图、保存状态、运行入口 | 启动一次明确运行；dirty时保存就近可达 |
| 运行中/等待 | 流程工具行的真实状态、图中活动步骤 | 停止；等待时显示原因/截止及提交匹配事件入口 |
| 错误/中断 | 对应步骤或输入任务的错误、原草稿保留 | 定位步骤、修正、显式恢复；不靠成功toast掩盖 |
| 完成但无交付 | 成果空态显示本轮成果可整理，来源可查 | 整理/发布交付，不写“业务已完成” |
| 有交付 | 默认成果；已有用户选择不被轮询改Tab | 看依据、选择继续、补输入、核对条件 |
| 业务已结项 | 标题一个“已结项”状态，正文与历史可读 | 完成条件任务中重开，保留原因与旧确认 |

当前阻碍只在真实存在时就近显示：未绑定具体步骤的业务阻碍在导航下单行提示，可展开完整内容并定位输入；不为正常状态保留空横条。HTTP错误保留局部表单和选择，模态错误留在模态内。

## 具体复用与最小改动

| 现有组件 | 使用方式 | 不搬什么 |
| --- | --- | --- |
| App/Sidebar/workspace | 原入口与方法/业务导航直接保留 | 不复制全站shell |
| WorkspaceHeader/WorkspaceTabs | 复用68px/46px节奏、标题层级、结构线与控件视觉；WorkItem本地组合自己的字段 | 不传伪造Work、不抽一组拥有几十个可选业务props的万能Header |
| ContextPanel | 不整体复用；共享的是已有Assistant和样式token | 不搬Work actions、trial、sample、inspector二选一面板。当前无必须提取共享shell的重复，暂不新增框架组件 |
| Assistant | 同一个组件加最小presentation/工作项上下文能力 | 不另写聊天输入、Thread或消息renderer |
| CanvasPane/WorkflowCanvas/NodeInspector | 直接复用实际画布/步骤配置，工作项自己的Flow工具行 | 不搬方法页候选、generate和版本选择整套wrapper |
| Management | 列表PageHeader、ListToolbar、ListPagination、ListLoading直接复用 | 不新建DataTable配置平台；列与业务请求留WorkItems |
| shadcn/Radix primitives | Button/Input/Textarea/NativeSelect/Tabs/Table/Dialog/DropdownMenu直接复用 | 新页面不新增手写基础控件；Badge仍经统一业务状态入口 |
| MaterialDialog/ArtifactValue | 原文、结构化内容、来源与原始模式直接复用 | 不为清单复用MaterialCard大卡片外壳，不默认铺rawJSON摘要 |
| RunInspector/RunArtifact | 所有固定Run/来源检查直接复用 | 不重建工作项专属运行检查器 |
| DeliveryView/json-render | 保留有限registry/store/稳定记录ID与真实actions；重建任务工具行 | 不新增任意页面DSL或领域字段推断 |
| DeferredContent/DeferredDetails | 四Tab首次访问挂载、历史/来源正文按需创建 | 隐藏Tab必须display:none；不用hidden状态继续布局画布 |

材料合并仅凭现有明确ID、绑定或来源：一个上传文件的原材料和本轮采用标识可以在同一行表达；不同received修订仍是独立输入，有修订/来源标识。无法证明关系时保留独立行，不能按同名文件猜合并。消除重复展示不能改写旧来源。

### 实际组件复用审计（重建开工时）

判断一致性看控件来源、状态语义和相同行为是否共用实现，不以业务组件数量多少衡量。下面区分已经核实的代码和本轮要求；旧表单未完成替换不算新版本已通过。

| 类别 | 具体组件与已核实事实 | 本轮处理 |
| --- | --- | --- |
| 直接复用项目任务组件 | Management 的 PageHeader/ListToolbar/ListPagination/ListLoading；WorkflowCanvas/NodeInspector；MaterialDialog/ArtifactValue；RunInspector/RunArtifact | 保留同一实现，仅由业务页提供数据与动作，不再复制一套列表/阅读器/运行详情 |
| 直接复用基础控件 | WorkItems、ItemRelations、DeliveryView均import同一ui/table；Detail import同一ui/tabs；现有Modal内部就是Radix Dialog；Input/Textarea/NativeSelect/DropdownMenu已有正式入口 | 新界面直接使用这些控件，不自造Dialog/Table/Tabs/输入组件；checkbox与file input保留原生语义即可 |
| 直接复用对话系统 | Assistant继续import assistant-ui ThreadPrimitive/ComposerPrimitive及现有ModelSelector全组；开工改动仅增加thread/composer presentation | 保留同一runtime、消息组件、IME行为与模型选器，不写第二份聊天或模型下拉 |
| 保留小型业务组合 | WorkItemDetail负责四Tab与实际命令；CompositionFlow负责工作项流程动作；CompositionInputs负责资料/采用关系；DeclaredInputForm负责实际inputContract字段；DeliveryView负责有限声明/稳定ID选择；PublishDelivery负责固定Run输出绑定；子项/验收任务负责各自业务前提 | 允许围绕真实输入、输出、错误拆小组件；内部继续组合现成控件，不抽万能workspace API或通用DataTable平台 |
| 需要收敛的存量控件用法 | 旧CreateItemDialog仍有原生文本input/select/textarea；DeliveryView原分页手拼上一页/下一页，外观与Management不同 | 创建表单换用已有Input/Textarea/NativeSelect；成果分页优先直接用ListPagination（支持25条），或同一Pagination primitives，不另设分页视觉 |
| 删除重复外壳 | 旧Detail长页头/独立成功条、重复状态筛选、文件chip＋raw摘要卡、孤立旧Plan/Progress/Acceptance等布局 | 有效能力纳入唯一任务面后删除其旧展示，不在新版旁保留第二套入口 |

已经向 UI agent 核对上述开工方案：当前没有新增Dialog/Table/Tabs/模型选择器实现；具体业务组合可以保留，表单和分页的存量不一致需随重建收敛。初版仍需实际操作验证焦点、错误位置、选择保留与两尺寸布局，import相同组件本身不证明整体已一致。

## 旧页面去向与业务能力保留

| 旧展示/任务 | 新去向 | 处理 |
| --- | --- | --- |
| WorkItems总览＋搜索＋重复状态下拉 | 单一管理页；搜索与一个状态筛选体系；全局数量仍可取得 | 重建列表头，保留稳定轮询、搜索/分页与全局口径。详细状态计数可放同一筛选菜单，避免两套同时显示 |
| CreateItemDialog全字段长表单 | “要做什么”的紧凑创建；标题/目标，文件或材料；编号/方法/条件按需 | 重建，保留可无方法/无条件开始；提交失败输入不丢；父项继承仍明确选择 |
| 旧Detail多区域/本轮composition长页头/成功横条 | 本文件稳定框架 | 删除旧外壳，不叠加兼容布局 |
| WorkItemProgress/Plan/BatchOverview/ChildPlan | 流程工具行、当前真实进展、子工作项任务面 | 合并有效信息；删除独立重复概览卡和旧布局 |
| WorkItemExecution/Artifact/Report与composition成果 | 成果主Tab＋共享固定运行检查 | 保留来源/比较/使用/引用依据能力，收敛到一个成果入口；旧跨方法Run仍可从记录打开 |
| WorkItemMaterials/ReceivedInputs/CompositionInputs | 输入主Tab一张紧凑清单＋统一阅读器 | 重建展示，保留原材料、实际输入修订与来源区别 |
| ItemRelations/BatchRun/ItemBatchProgress | 流程工具行“子工作项 N”打开宽Dialog任务面 | 保留直属/范围待办/排除、分页、批量处理、暂停、作用域与返回；不把父子业务关系画成调用依赖图 |
| CandidateItems/手工添加子项 | 成果附近“建立子工作项”任务或子项管理“添加” | 保留候选审阅、明确选中、部分失败回执、重复来源已有项入口；普通数组不自动建项 |
| WorkItemAcceptance/Criteria与CompositionAcceptance | 导航唯一“完成条件”Dialog | 合并为一套：先存定义、明确引用依据、人工确认、子项阻塞、结项/重开。不能只保留composition简化表单而丢引用与范围检查 |
| GenerateItemMethod/PrepareItemRun/ChildStageChoices/CompletionInputChoices | Assistant＋流程/成果的实际准备任务 | 保留固定版本、明确输入、子项多轮成果与完成依据的不同选择；不保留旧说明卡。方法生成直接进入同一Assistant上下文 |
| 旧固定“补证/整改”跟进展示 | 成果就近的通用“继续处理/建立子工作项”任务 | 保留真实子项/输入/来源能力；业务标题由用户或声明决定，通用UI不再提供固定业务分类 |
| WorkItemHistory与composition两个历史列表 | 记录主Tab一份时间线，运行作为可打开来源 | 保留跨方法历史、当时条件/输入和旧报告；展开按需加载 |
| 被新任务取代且无调用的旧组件/CSS | 删除 | 删除前逐项确认能力已有新入口，不以“还在文件中”代替保留 |

## 实施边界与验收

本 agent 暂无必须修改的 app/components 产品文件。框架统一通过现有容器、token、primitives和实际业务组件实现；若实施发现同一纯外壳确有重复，再向 root 提出一个最小共享组件，不能为“统一”强制提取。WorkItem agent负责features/work-items与最小Assistant适配，避免双方同时重排页面。

实施后必须重新实际操作并查看1440/1024截图：列表、创建、空工作项直接输入、有交付表格、长Assistant消息仍可输入、输入阅读、选记录继续、子项任务、验收/重开、错误保留。检查整页无横向溢出、表格不被1024侧栏压窄、Tab/轮询保持状态。来源审计截图只证明当前问题，不能作新设计已通过的证据；模型与runtime的既有通过不替代新UI验收。

## 独立框架与组件复核（重建后）

2026-10-28。本节为第二份只读复核：读取当时工作区源码并实际打开 UI agent / 独立旅程评审生成的最新截图；未重复启动测试或修改产品源码，未触碰托管服务。第一轮失效截图不作为最终状态，来源审计图片也未混作本轮通过证据。

已查看的本轮证据：

- `evidence/ui-review-round2/screenshots/review-direct-input-{1440,1024}.png`：空工作项无需先初始化即可输入，1440并排、1024底部Composer均可见。
- `evidence/ui-review-round2/screenshots/review-long-assistant-{1440,1024}.png`：48段长消息后，当前未发送文本、完整Composer和发送按钮仍在视口；1024覆盖层贯穿整个内容区，关闭按钮仍可达。
- `evidence/ui-v2/delivery-{1440,1024}.png`、`flow-1024.png`：成果取得主区宽度，表格/分页与流程图有独立任务位置，底部停靠输入没有造成整页裁切。
- `evidence/ui-v2/input-revision-1440.png`、`nested-source-1440.png`：声明字段复用统一输入与Dialog；来源进入既有方法运行检查页面，没有新增工作项专属检查器。
- `evidence/ui-review-round2/screenshots/review-modal-conflict-1024.png`、`review-structural-acceptance-1024.png`：错误在模态内可读，原条件输入保留，保存/结项动作可达；无独立条件的结构父项可以检查真实子项范围。
- `evidence/ui-v2/list-{1440,1024}.png`、`create-{1440,1024}.png`、`inputs-1440.png`：列表收敛为一套状态筛选与既有Management布局；创建表单的标题/目标/文件/材料和折叠选项有明确分组，1024创建按钮完整可达；资料按身份呈现一行，原重复文件chip/raw摘要卡已删除。

当前代码与框架判断：

| 检查 | 当前事实与结论 |
| --- | --- |
| 控件直接复用 | WorkItems、资料表、交付表与子项表使用同一ui/table；四Tab使用同一ui/tabs；任务Modal仍基于已有Radix Dialog；创建与合同表单已使用Input/Textarea/NativeSelect；成果分页已改为Management.ListPagination。未发现新增基础Dialog/Table/Tabs/分页实现 |
| 会话直接复用 | CompositionAssistant只组合工作项数据与已有Assistant；后者保留原runtime、Thread、Composer、消息与ModelSelector。同一挂载实例通过presentation切换，不复制发送或模型选择逻辑 |
| 阅读与来源直接复用 | 输入正文使用MaterialDialog，交付内容使用ArtifactValue/Value；固定来源经onRun进入既有Results→RunProcess→RunInspector/RunArtifact路径。新页面没有另一套材料阅读器或运行检查器 |
| 自定义组合的必要性 | useCompositionWorkspace仅负责本工作项HTTP轮询、修订排序和命令；Assistant/Children/Acceptance/ActionTasks分别拥有会话映射、子项交接、条件草稿/重开、接续/保存/事件/引用的局部表单状态。它们组合现有控件，未形成可配置通用页面平台，职责符合本轮需求 |
| 满高与滚动 | scoped item-workspace-host补齐height/min-height/flex；Detail、Tabs、body/main一路min-height:0；chat viewport自行滚动、composer flex:none。round2截图证明本轮长会话与输入Tab切换不再重现第一轮页面撑高/裁切 |
| 1024覆盖层 | CSS在窄桌面把展开侧栏定位到composition-body内，使用top/bottom锁高度；默认停靠保留直接输入，展开不会把表格强压成双栏。已查看的两种状态符合方案 |
| 页面一致性 | 页头、导航、单一状态、控件边界与原方法工作区沿用同一视觉体系；已删除本轮重复成功横条与文件chip/raw摘要卡。未要求为统一而整体搬ContextPanel或新增workspace API |

本阶段未发现阻断性的框架/组件问题。列表与创建的最新两尺寸截图已补齐并实际打开查看，其控件边界、表格/模态尺寸和主要动作可达性符合现有体系。当前已指出拆分后的无用import与孤立旧展示仍需收口，具体删除以业务入口已接通为前提。

两处非阻断收口已反馈 UI agent：列表默认阶段“待处理”仍与“待推进”并列，建议消除这种默认语义重复而保留真实业务阶段；停靠模式的dirty禁用原因已补入placeholder，但有未发送草稿时placeholder不可见，还应保留简短可见提示。后一组合未在当前截图验证，不将建议当作已修复事实。

未测边界：本 agent 本轮没有另跑浏览器用例、真实模型或runtime测试；交互与数据正确性采用独立旅程/原有分层证据，不能由静态截图推定。动态调整窗口宽度、移动设备和长表单所有组合不在本轮截图复核范围。用户最终审美认可仍单独记录，本节只报告组件来源、框架实现与已查看截图。
