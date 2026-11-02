# 正式 shadcn/ui 控件

本目录于 2026-09-20 从 shadcn 官方 `new-york-v4` registry 获取 Radix 组件源码（MIT），例如 [Tabs registry](https://ui.shadcn.com/r/styles/new-york-v4/tabs.json)。接入方式参考 [官方文档](https://ui.shadcn.com/docs)、[主题变量](https://ui.shadcn.com/docs/theming)。源码纳入仓库是 shadcn 的使用方式。

- `components.json` 指向正式 `src/client/styles.css`，`@/` 在 TypeScript 与 Vite 中均指向 `src/`。
- 官方 `cn` 导入改为本项目 `client/lib/utils.ts`（clsx + tailwind-merge）；组件之间的 registry 路径改为正式路径；Dialog 关闭文本本地化。
- 主题 token 对应现有 Geist 暗色。Tailwind 的主题与工具类作用于正式代码；不全局引入 preflight，以免重置尚未迁移的画布和编辑器。原生控件旧样式放在 `@layer base` 并保持低优先级 `:where(...:not([data-slot]))`，不会争夺这些组件的样式。
- 层叠约定见 `styles.css` 顶部：业务布局在 `@layer components`（低于 Tailwind utilities，工具类可覆盖）；少量未分层规则是需要压过工具类的存量共享外观（`.muted`、`.field`、`button:disabled`）与 `.button`/`.badge`/`.modal` 兼容层覆盖，以及第三方（react-flow、assistant、markdown）覆盖。给 primitives 加样式时用工具类或 variant，不要再往未分层里叠；要覆盖未分层规则只能同样未分层，并知会本轮的分层边界。
- `main.tsx` 在 App 之前导入全局 `styles.css`，先注册 `theme/base/components/utilities` 的层顺序。功能 CSS 可声明 `@layer components`，但不能抢在全局顺序之前注册，否则 `base` 会覆盖组件，已打开流水线等原生按钮会退回边框、白字与默认字号；管理页视觉验证需包含非空侧栏。
- `../ui.tsx` 仅兼容原有业务 `primary/secondary/ghost/danger` 和 `Modal`、业务状态 Badge API，底层使用这里的 Button/Badge/Dialog；新页面直接使用 primitives。
- `../Management.tsx` 只组合两页已重复的页头、搜索、分页、载入状态；列、请求和业务动作留在各页面。
- NativeSelect 是官方样式的原生选择控件，键盘选择由浏览器提供；Tabs、Dialog、DropdownMenu 的焦点及键盘行为由 Radix 提供。简单列表用 Table，不引入通用数据表配置平台。
- 下拉框使用不透明 `bg-background` 与 `text-foreground`，选项和分组使用 popover 色；`styles.css` 的 base 默认值同时覆盖普通 `<option>` / `<optgroup>`，禁用项保留 `GrayText`。HTML 提前声明暗色 `color-scheme`，与根主题一致；原生选中高亮和键盘交互交给浏览器，不用 `selection:*` 模拟选项高亮。
- 控件边界统一使用 `--control-border`（Tailwind `border-input`），页面结构线及卡片边界继续使用 `--line` / `--line-strong`。侧栏小字使用提亮后的 `--subtle`。禁用按钮由既有未分层 `button:disabled` 规则统一使用中性背景和清晰灰字，不降低整体透明度；保留原生 disabled 行为。画布关系聚焦仅轻微淡化其它节点和连线，保持文字及关系可辨认。
- popover.tsx / command.tsx 随 `../assistant-ui/model-selector.tsx`（vendor 自 @assistant-ui/model-selector registry）一同接入，command 依赖 cmdk；仅服务于模型切换器与后续同类受控 popover。

`../DeferredContent.tsx` 提供首次访问后保留状态的内容挂载，以及首次展开才创建正文的 details。隐藏标签页、工具记录和大材料用函数子元素延迟构建，避免隐藏正文仍解析 Markdown/递归生成集合。

旧 Spike 保留自己的 `tsconfig.spike.json` 别名，不能据旧样式修改正式控件。全项目剩余原生编辑控件尚未全部迁移；此次范围是两个管理页、共享按钮/弹窗以及函数式编辑使用的新控件。

2026-10-22：工作项详情对话框、完成条件和集合搜索直接复用Input/Textarea/NativeSelect；复选框保留原生语义，轮次/环节保留业务导航布局，不为复用强行套Button。`--color-input`统一指向`--line-strong`。详情页头仅由WorkItemWorkspace.css负责，已移除WorkItems.css中冲突的旧页头规则；Tabs宽度/伸缩用组件className工具类明确指定。旧兼容层未做全仓迁移。Management.css仍是两种管理列表的布局入口；本次不新增通用页模板。

状态Badge追加约定：已知执行、业务、做法状态使用集中Lucide映射和无边框status-label；紧凑iconOnly保留title及sr-only状态文字。普通元信息标签同为中性无框，勿在页面再复制状态圆点/彩色pill。完成执行与业务结项沿用各自明确文本，不能仅以图标推断结项。

运行依据复用现有Dialog并在打开时创建真实字段；环节要求复用DeferredDetails，归入既有输入与依据。信息需要独立查看时提供明确动作，不在主内容前堆说明段落或为每段说明新增工具栏。普通标签/错误/真实报告按实际用途保留。

整页空状态使用 `empty-state` 类，状态标签可使用 `empty` 业务状态；两者不共享布局选择器，避免未定义流水线的标签套上空页面高度。


2026-10-28：`../WorkspaceFrame.tsx` 与对应CSS是工作项和流水线实际共用的页面构图，仅组合页头、导航、主区和辅助侧栏；Tab/菜单/按钮/对话框继续使用本目录控件。侧栏拖拽、键盘调宽和宽度记忆由同一个WorkspaceSidePanel负责，Inspector与Assistant占用同一位置。业务数据和命令留在各features，不把此组件扩成通用页面DSL。首页复用创建/上传函数，成果导航来自声明；子项真空态不渲染搜索及零项分页。当前详情由CompositionWorkspace.css负责内容布局、WorkspaceFrame.css负责公共骨架，旧WorkItemWorkspace构图不再是当前基线。


2026-10-29：首页/工作项/流水线为Sidebar中的真实页面链接，带href与aria-current，保留Ctrl/Command点击及新标签语义；不再做页内Tab。详情内容继续复用原Radix Tabs。列表公共布局在Management.css的management-content，工作项和方法目录实际共用；页头使用WorkspaceHeading，创建动作归所属页面负责。首页居中输入区不规定列表宽度。

工作项原生OpenUI适配位于features/openui：Records复用RecordTable的表格与分页；InputForm复用InputFields、Input/Textarea/NativeSelect，ActionButton复用Button，详情复用Modal。官方Renderer处理程序与原生绑定，不定义第二套控件或解释器。模态中的field要使用composition-input-dialog局部样式，避免未分层.modal .field覆盖组件层间距；详情的Markdown首尾段落不额外增加外边距。

界面安排编辑复用本目录Tabs、Input、Textarea、NativeSelect、Button及现有WorkspaceFrame。Textarea显式field-sizing-fixed及有限高度，具名声明定位在其内部滚动；NativeSelect的w-fit包装仅在.ui-arrangement作用域改为填满字段列，未改变全局原语。结构树使用普通受控按钮及业务标题，不引入新的树组件库或第三栏。


来源使用既有材料卡片外观及Button/DeferredContent/ArtifactPreview组合：多份页内展开，真实编号与业务字段摘要可并排阅读；单份直达。低频动作不平铺成编号按钮，也不为缩小面积一律塞入菜单。来源卡片沿主内容滚动，复用material-cards响应式列宽，不新增通用Card组件或独立布局系统。


共享Modal透传Radix的onCloseAutoFocus；由外部节点触发而未包DialogTrigger的固定流水线预览显式恢复原按钮焦点。节点引用复用Button，固定定义预览复用Modal及WorkflowCanvas，不新增节点组件库、第二画布或编辑器。


工作项call节点直接用既有Button呈现方法标题链接、进度实例入口，避免在节点内再嵌套整张应用卡片。IR原语文字和具名端口属于稳定图形语义；使用Lucide Workflow/FileOutput等现有图标表明应用及交付绑定，不引入新节点库或独立渲染规则。

工作项会话入口复用DropdownMenu + RadioItem和现有Button，在Assistant标题栏呈现当前会话及新建图标；历史行只含标题、消息数/时间/回复状态。继续使用既有Composer和可拖侧栏，不新建会话导航栏。实际处理状态和固定过程入口由应用骨架呈现；历史成果保持固定来源，不将按钮适用记录数冒充业务待办。

原生ViewNavigation复用Tabs/NativeSelect，navigation显式决定，不能按数量更换控件。Records详情复用Modal，记录ID单独描述；ActionButton复用原有Button。来源、完成依据、子项与方法入口是应用工具，位于真实过程检查的RecordTools更多菜单，与模型安排的业务动作分开。

任务导航复用ObjectLink真实链接行为与既有外观。ContentVisibility表示保留内容当前是否实际可见，DeferredContent按Tab传播、Modal及菜单/Popover内容读取后控制Portal；父页面hidden不能单独隐藏body中的Dialog。此上下文只决定显示，不清表单、不改变业务状态，不作为新导航/布局DSL。方法对话框所属id由usePanels/WorkspaceDialogs固定，不能无提示随当前controller重绑其它对象。

2026-11-02：动态工作面增加Stack/Disclosure/Dialog的原生OpenUI适配，Dialog复用既有Modal和局部composition-input-dialog样式，错误显示在打开的任务内。动作emphasis映射现有Button的default/outline/ghost；表格搜索与勾选由明确声明开启。工作项固定操作放在既有更多菜单，不额外建立工具栏。正式业务数据和动作语义仍由原服务承担。

动态界面的排版由组件承担，不交给业务程序补margin。`features/openui/OpenUIWorkspace.css`是这些组合构件的样式入口：ViewNavigation负责导航到内容16px，Workspace/View负责主要区块24px，Section负责标题到内容12px，Section正文和Stack负责同组内容16px。Section子项默认纵向；需要横向组合时显式使用Stack，不根据Metric等子组件类型猜布局。表格/报告/详情/表单复用openui-content组织自身标题与内容，表单无页面外边距；标题和段落不再额外堆margin。共享Tabs的其它使用方保持原约定。
