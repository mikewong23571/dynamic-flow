# 治理方案与迁移地图

本文为本 track 的目标方案，尚未实施；当前事实见 [audit.md](audit.md)。长期规则在实施验证后写回既有 client AGENTS、ui README 和 DESIGN-NOTES，本文保留任务决策，不维护平行规范。

## 1. 组件层次与样式所有权

| 层次 | 现有入口 | 该层负责 | 与相邻层的约定 |
| --- | --- | --- | --- |
| 主题与基础 | styles.css、main.tsx、index.html | 语义 token、根字体/暗色、最小 reset、明确层顺序 | 字面颜色集中，保留 14px 根字号；外观不由业务状态反向决定 |
| 基础控件 | components/ui/ | Button/Input/Select/Textarea/Tabs/Dialog/Menu 的内部尺寸、变体、状态、ref/原生语义 | 明确的 API 选择形式，调用方 className 不靠未分层覆盖争夺内部外观 |
| 共享应用组合 | WorkspaceFrame、Management、Modal、Material*，必要的 Field/FormActions | 页头/工具栏/字段/动作区/任务浮层的内部排列与交接 | 父容器拥有子项外部间距；材料 reader 等专用构图可保留 |
| 业务展示和适配 | OpenUIWorkspace、InputFields、RecordTable、RunInspector、WorkflowNode、Assistant | 业务内容、真实状态、专业内容及 SDK 适配 | 使用上述公开接口；布局样式归实际拥有者，保持业务数据与样式分离 |
| 页面骨架 | App 组装的工作项/流水线/管理页 | 区域占位、滚动、侧栏有效布局和响应式 | 页面不重写所有 button/input 外观；公共壳层只处理构图，不吞业务状态 |

实际复用链：App → WorkspaceFrame/Management；WorkItemDetail → OpenUIWorkspace → RecordTable/InputFields/ArtifactValue → primitives；ContextPanel → NodeInspector/Assistant → primitives；Modal → Dialog primitives。组件层次不要求每个目录再添加一层包装。

## 2. 层叠方案

- 保持 theme → base → components → utilities 的职责顺序。第三方导入采用显式 vendor 层并置于适配/业务组件之前；若具体导入工具有兼容限制，在样板验证后选用等价的受控顺序，不以未知构建行为为前提批量迁移。
- token 在主题入口；reset 只做继承、box sizing、原生选项等基础行为，不能给所有控件加业务外观。
- 自有共享/业务/第三方适配规则进入 components，第三方适配限定 canvas/Assistant 等根作用域；允许少量基础交互上下文，如 ContentVisibility，不扩展成样式平台。
- 不保留无限期未分层“最高优先级修补区”。每迁移一组先核对实际依赖，再同步移出旧规则；避免只包层后样式被第三方覆盖。
- `.muted` 不能兼任所有字体层级；Field 不含页面 margin，FormActions 不由全局名称继承固定上边距。按样板逐步替换旧类，最后核对无调用再删除。

## 3. 控件与组合形式

- 沿用 components/ui/button 的 variant/size 基础；业务主/次/quiet/danger 对应关系只维护一处。迁移 ui.tsx 的 Button 调用后移除该兼容导出；业务 Badge 和 Modal 保留或改为清晰的应用组合入口。
- 建议标准控件高 32px、紧凑 28px，必要的大尺寸沿已有明确用途保留。通过 token 显式表达，避免把 h-8 在 14px 根下误作 32px；首批管理工具栏和 InputFields 验证后冻结数值。
- Input/Select/Textarea 共用尺寸、文字、边界、focus/invalid/disabled 语言；Textarea 的多行增长/固定滚动按任务显式选择，不能改坏 source 编辑器与 Composer。
- NativeSelect 对包装层提供明确的 fill/fit 布局接口。表单默认填满字段列，工具栏/分页明确采用内容适配；保留原生 option、键盘选择及 disabled。
- 为实际重复的标签/控件/帮助/错误和动作区提供少量共享组合。已有简单布局可用共享类，只有反复出现的结构才抽成组件；不新建通用 Card、万能 Form 或页面配置 DSL。
- 父容器 gap 管直接子项；内容默认无页面外边距。沿用最新 OpenUI 的 Workspace/View=24、Section 标题到内容=12、同组 Stack=16、导航到内容=16 的方向，再验证 fieldset/弹窗里的实际结果。
- 文字尺度先按正文/长阅读、控件、元信息、分组标题、页头等少量角色收敛；代码/原始数据保持等宽，图形标签和专用报告可有明确例外，不机械替换所有 px。

## 4. 骨架与任务浮层

- 明确 userPreference（用户希望展开、已保存宽度）与 effectiveLayout（当前能呈现的并排/停靠/临时检查）。窗口变化更新有效布局，不丢弃偏好或输入。
- 1440 正常并排；1024 默认底部 Composer。手动临时检查时，主动作应仍可见/可命中，或有清楚的检查返回行为；不以覆盖主区但仍显示为“可见”通过验收。
- 该决策在 WorkspaceFrame 或其专用 hook 维护，两个业务工作区共同消费。保留现有 resize、键盘调宽、状态保存及 Inspector/Assistant 共享位置。
- Modal 提供受控和带触发器两种明确用法：打开时记录当前触发/任务锚点，Escape/关闭/成功时恢复仍存在且所属页面可见的锚点，失效时回到合理任务位置。
- 任务错误就近呈现、失败保留草稿、短桌面页脚可达、页面隐藏时 Portal 不泄漏。材料 reader 的内容/原文和独立尺寸不退化。

## 5. 迁移分组及验证

| 分组 | 必查入口/调用方 | 迁移重点 | 代表回归 |
| --- | --- | --- | --- |
| A 基础与样板 | primitives、ui.tsx、Management、InputFields | API、尺寸/包装层、字段/动作间距 | 管理两页 + 页内/任务弹窗 + 状态矩阵 |
| B 骨架/浮层 | WorkspaceFrame、WorkItemDetail、ContextPanel、CompositionAssistant、Modal/MaterialDialog/MethodPreview | 缩窗占位、偏好恢复、焦点/Portal/滚动 | 冷打开、缩窗往返、Escape/关闭/成功、外部触发 |
| C 编辑/设置 | NodeInspector、SemanticFields、Collection/ExpressionEditor、CatalogManager、ModelSettingsDialog | 原生表单分类迁移，紧凑编辑和设置一致 | functional-editor/multi-input/canvas-layout + 设置/模型选择器 |
| D 工作任务 | workspace 各 Dialog、work-items/composition、OpenUI | 文件/表单/版本错误、嵌套组合、表格与任务动作 | openui-workitem/capabilities/review、primitives、调用/材料 |
| E 内容与相邻区域 | Results/RunInspector/ArtifactValue、Assistant、Sidebar、WorkLibrary | 专业内容与第三方覆盖归属、公开控件使用 | openui-process/workitem-workspace、会话/引用/导航、非空侧栏 |
| F 收尾 | 所有盘点候选、指南、测试入口 | 兼容/未达 CSS 清理、防止再引入 | SG01–SG10 对照及可重复视觉/行为验证 |

原生控件处置规则：checkbox/file 保留浏览器语义与统一基础呈现；表头排序、业务步骤/树入口、侧栏对象链接按其导航/选择语义保留，不为降低标签数套 Button。其余 47 处表单候选逐文件核对并迁移/说明。

## 6. 验证与规则维护

- 在现有 Playwright fixture 中验证 meaningful 合同：主要动作真实可点击/命中、焦点回到正确对象、字段与组合间距、同密度控件尺寸和隐藏内容真实不可见。
- 选少量稳定区域作截图基线，覆盖控件状态、两种工作区、管理列表、任务弹窗；固定字体/视口，处理时间/ID和流式变化。截图变化仍需人看图，不靠更新 golden 自动宣布接受。
- 最小静态检查限制新增非 token 色值、退役控件入口和无归属未分层覆盖；仅对明确禁止的模式失败，专用几何/第三方适配有具体例外。盘点脚本只是研究工具，不直接变成全仓零数值门槛。
- 最终以根/模块 AGENTS 和当前指南为规范入口；此次反例、取舍与验证保留在本 track。无关生产治理、权限或架构平台不进入范围。
