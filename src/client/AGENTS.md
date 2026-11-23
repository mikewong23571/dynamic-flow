# 工作区前端

前端呈现工作内容、收集编辑和明确动作；服务端保存Definition、Run、输入来源与业务状态。继承根约定，改动视觉前读DESIGN-NOTES和components/ui/README。

| 入口 | 职责 | 相邻模块 |
| --- | --- | --- |
| `app/App.tsx` / `controller.ts` | 固定应用骨架、方法工作区与工作项组合 | navigation、state |
| `app/navigation.ts` | 地址与History/popstate；导航不重放业务动作 | ObjectLink、页面选择 |
| `state/` | 方法SSE、草稿、选择、面板及实际动作 | flow、HTTP |
| `features/work-items/WorkItems.tsx` | 首页、顶层工作项摘要列表、稳定行序、缓存已访问详情 | roots摘要API |
| `WorkItemStart.tsx` / `create-item.ts` | 创建、上传、部分成功回执、按身份重试 | 同一工作项Assistant |
| `WorkItemDetail.tsx` | 工作/流程/输入/记录、当前会话、运行控制和固定处理过程 | workspace快照 |
| `features/openui/OpenUIWorkspace.tsx` | 正式OpenUI Renderer/组件库、原生state和toolProvider | `shared/openui.ts`、真实workspace/actions |
| `features/work-items/composition/UiArrangement.tsx` | source草稿、SDK声明定位、具名patch关注及版本保存 | 同一当前uiProgram |
| `CompositionFlow.tsx` | 本项定义画布、固定call方法预览 | 共享canvas/inspector |
| `CompositionInputs.tsx` / `DeclaredInputForm.tsx` | 实际输入、合同字段、修订与来源 | 精确inputBindings |
| `RecordTable.tsx` / `DeliverySources.tsx` | 真实行、筛选分组分页及固定来源 | OpenUI原生selection |
| `CompositionActionTasks.tsx` | 明确选记录、继续方法、等待等应用表单 | 真实业务动作 |
| `CompositionAcceptance.tsx` / `CompositionChildren.tsx` | 条件依据与人确认、直属子项和阶段接续 | 生命周期业务API |
| `CompositionAssistant.tsx` / `useItemConversations.ts` | 现有Assistant多会话、会话草稿和当前请求 | assistant-ui、Pi |
| `useCompositionWorkspace.ts` | 200/304接纳、版本顺序、轮询和命令 | 完整ItemWorkspace DTO |
| `features/canvas/` / `features/inspector/` | React Flow、ELK、IR节点和有限表达式编辑 | shared/node-ports、flow校验 |
| `features/results/` | 通用产物、RunInspector/RunArtifact、真实实例和来源轨迹 | 固定Run及Definition |
| `features/assistant/` | 同一assistant-ui运行时、消息/活动/错误/Composer | OpenUI只读历史预览 |
| `components/ui/` | 统一shadcn/Radix控件 | 控件README |

## 工作项与OpenUI

读取GET /api/items/:id/workspace，写入POST同路径/actions；共享DTO在shared/workitem-composition.ts。WorkItem.workId指向本项方法空间，inputBindings是唯一执行选择，deliveries为固定成果。原生uiProgram={id,definitionId,source}是唯一当前界面，不保留旧计划编译器或第二套spec。

shared/openui.ts的官方SDK库schema同时提供作者说明和React适配库。OpenUIWorkspace真实使用createLibrary/defineComponent/Renderer及useStateField；不自建解释器。Workspace/Section/View/ViewNavigation组织内容；Records/Report读固定delivery；InputForm使用实际inputContract；ActionButton触发原生Mutation或@ToAssistant。Query只有读工具。未保存source或历史预览自动只读，不注册写工具，不能依靠每个调用方记住禁用。

表格只接真实rows、冻结rowKey和sources；继续只传deliveryId/recordIds，不提交客户端记录正文。标签变化保留浏览、选择和草稿；delivery身份或合同改变清对应状态。输入首编辑捕获baseRevision，提交不能借轮询的新revision跳过冲突；失败保留草稿。明确关联output的后续记录表单随该delivery变化清草稿。输入修订与执行是分开的动作，旧Run不改变。

source编辑使用SDK声明和merge；完整保存必须通过正式校验，partial parser容错不是保存成功。脏草稿收到外部修改时保留并提示冲突；保存回执不能清掉之后编辑。所有页面Assistant入口调用同一requestAssistant并传当前conversationId；uiFocus为已保存程序的具名声明，不混入执行scope。

流程页有固定可达“处理过程”：选择真实Run，进入call实际子Run、节点、实例、产物/输入与依据/执行记录、原始数据和固定来源。RunInspector按workId/runId/definitionId读取，加载失败保留轨迹，不换成最新运行。失败输入补跑形成新Run；原失败运行保持可查看。正式执行、单步/比较、发布和业务结项分别处理。

## 状态与导航

首页/工作项/流水线是固定入口；/items/:id和/methods/:id由URL恢复对象与Tab，固定Run带run参数。导航不启动模型/上传/运行。ObjectLink保留href及修饰键语义；返回原项的链接不改变Run归属。工作项列表与首页最近处理仅标题区域提供详情入口，悬停/焦点可辨；不增加重复箭头入口或无操作的末尾导航列。根列表请求summary=true&view=roots，不在分页后前端隐藏子项。

WorkItems保留已访问详情实例，隐藏时停止轮询并隐藏Portal。ContentVisibility/DeferredContent保证隐藏内容实际不可见且不创建长正文。200快照整体接纳；304无正文不解析；旧请求按generation/revision丢弃。读取失败成功恢复后只清读取错误，动作错误留到明确重试/关闭。

方法快照经useConnection→useDraft/useSelection→useActions。SSE不覆盖dirty草稿；expectedDraftId检查版本。异步回执按发起workId更新缓存，不能切换当前对象或清另一项草稿；saveDefinition只在没有后来编辑时清dirty。来源完整值按需读取，不预取全部历史。

会话草稿和方法引用按conversationId保存在sessionStorage。回执只清发起会话的已发送草稿，迟到不能清新会话草稿或撤回清单。Composer保持同一assistant-ui运行时；IME在compositionend同步，不能每次组合键重建编辑器。/pipeline只选择固定版本引用，不执行。

画布布局不属于Definition。现有位置优先，移动/端口改变使旧异步布局失效；shared/node-ports是唯一端口来源。普通节点明确operation，call固定版本及端口，不按业务label猜语义。通用ArtifactValue按真实结构展示，不解释领域字段。复杂业务留在方法。

## 视觉与验证

复用Geist暗色、统一token、shadcn/Radix/Lucide；业务CSS保持components层，第三方导入放vendor层；Field/FormFields/FormActions和Modal为共享组合，不新增未分层覆盖。样式拥有者及公开接口见components/ui/README。页面以内容、状态和就近动作表达，不铺实现说明。错误显示在所在任务，保存、关闭与Composer始终可达。

1440默认并排Assistant，1024默认底部Composer；展开消息复用同一实例。forceMount的隐藏Tab必须display:none，隐藏画布不布局。表格长内容按需展开，来源和Modal不能穿透到别的页面。

默认pnpm dev使用独立4330/4331及.flowcraft-dev-data，HOST默认0.0.0.0供查看；pnpm dev:managed为托管4320/4321，调试不得使用。Playwright全部通过临时dataRoot和随机端口应用，读取独立构建dist；FLOWCRAFT_EVIDENCE_DIR指定截图。正式原生场景在openui-*.spec.ts，会话、固定方法、导航、原语场景相邻。源码/模块/真实模型/浏览器/两尺寸视觉结果分别报告，不用历史数量代替当前验证。

业务可见性纠偏：动态界面贯穿处理过程。read_inputs复用resolveItemInputs；read_children复用已有summary；read_output以本项明确Run和Definition读取阶段产物，与正式Delivery分开。Details/Metric/DataTable只组织真实数据，字段/标签由Assistant安排；现有Records/Report保留固定交付与业务动作。新验证入口tests/workitem-visibility.test.ts、tests/browser/workitem-visibility.spec.ts，实际模型质量与视觉边界见当前track。

页面组合能力：Stack组织纵向/可换行横向内容；Disclosure展开辅助内容；Dialog用原生$open绑定承接就近任务，InputForm可用同一$draft预置当前记录身份。原生@Each与数据函数直接由SDK处理，不自建循环/求值器。ActionButton声明primary/secondary/quiet及实时disabled，默认secondary。内容/表单的空标题不重复渲染标题；表格只有显式绑定selection才显示勾选，searchable为true才显示搜索。固定执行/保留版本/界面编辑归工作项更多菜单，主区由Assistant按实际工作安排；工作主区不再以“成果”限定数据阶段。

OpenUI布局责任：适配器及OpenUIWorkspace.css一起定义导航、视图、区块和内容的排版；父容器负责直接子项的间距，内容组件无页面外边距。SectionRenderer负责显式业务分组的轻边界、useId可访问命名与有标题祖先的嵌套层次；同组可混合表格/表单/文字/动作，Stack只排布。空Section标题保持无名且不占标题层级，不按子内容自动分组。对应真实浏览器回归为openui-sections.spec.ts。具体控件层级见控件README。不要再把这部分样式散放到工作项外壳，或根据子组件类型自动猜横向/纵向排列。

前端样式治理：Button只从components/ui/button导入；控件标准32px、紧凑28px，Input/Select/Textarea明确400值字重，Field不带页面margin，父容器gap管理外部间距。NativeSelect默认填满字段，工具栏显式fit。WorkspaceFrame按窗口切换物理停靠并保留展开偏好/宽度；1279以下不以side覆盖主动作。受控Modal承担焦点交还，触发失效回当前任务标题。专用样式在实际features CSS；运行pnpm check:styles及tests/browser/style-governance.spec.ts，不能只检查scrollWidth或更新golden。
