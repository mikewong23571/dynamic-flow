# 正式 UI 控件与组合合同

本目录由 shadcn 官方 new-york-v4 registry（MIT）源码接入，结合现有 Geist 暗色实现。继续使用 Radix/Lucide/assistant-ui、React Flow 和 OpenUI；不引入第二套控件或页面 DSL。

## 样式层次与入口

| 层次 | 入口 | 职责 |
| --- | --- | --- |
| 主题/reset | styles.css，main.tsx 先导入 | 14px 根字号、语义 token、最小继承和原生行为 |
| 第三方 | styles.css 的 vendor 层 | React Flow 官方样式，低于本项目适配 |
| 基础控件 | components/ui/ | 控件内部尺寸、状态、变体和原生/ref/asChild 合同 |
| 应用组合 | ui.tsx、field.tsx、WorkspaceFrame、Management、Material* | 业务状态、任务浮层、字段/动作分组、公共构图 |
| 业务呈现 | 各 features 的实际 CSS | 业务内容、SDK 适配、专业几何、局部排列 |

层顺序是 theme → base → vendor → components → utilities。自有规则必须在明确层中；禁止无层覆盖区和 components 内重复嵌套 components。className 是明确的公开覆盖入口；业务后代选择器不改基础控件内部字号、padding、高度、颜色、边框。结构排列可通过容器 gap、align-self、宽度约束表达。

App.css、Assistant.css、NodeInspector.css、ModelSettings.css、Results.css、WorkflowCanvas.css、WorkspaceDialogs.css 等由实际组件导入，styles.css 仅保留主题、reset 与少量共享组合；共享 Markdown 在 components/Prose.css。

## 控件

- Button 统一从 ui/button 导入。default 是主动作，outline 是次动作，ghost 是轻动作，danger 是描边危险动作；destructive 为明确实色破坏动作。ui.tsx 不再导出兼容 Button。
- 控件标准高32px，紧凑28px，大尺寸40px；Button 使用 size=default/sm/lg 和对应 icon 尺寸。Input 使用 controlSize，NativeSelect 使用 size，均保留原生属性与 ref。根字号14px，因此不把 h-8 误当32px。
- 输入控件的值使用 text-control=13px、font-normal；Field 标签权重不会传播到控件值。边界用 control-border，结构线用 line/line-strong。
- NativeSelect 默认 layout=fill，包装和内部控件一起填满字段；工具栏/分页显式 layout=fit。wrapperClassName 是必要时的包装层布局接口。option/optgroup 始终不透明暗色，原生键盘与选中高亮交给浏览器。
- Textarea 默认 fixed 字段高度、保留 rows 与原生内部滚动/resize。首页需求、source 编辑器、Composer 各有明确增长/滚动用途；不要通过全局 textarea 规则改变它们。
- 状态使用同一焦点/禁用/invalid 语义。业务状态 Badge 仍在 ui.tsx，Lucide 图标和文字区分执行完成与业务结项；普通元信息不冒充状态。

## 共享组合

- Field 管标签/控件/帮助/错误的内部间距，不带页面 margin。FormFields 明确组合 native fieldset，保留整组 disabled；不全局布局所有 fieldset。
- FormActions 只管动作对齐与换行，外部间距由父容器 gap 管理。meta-text 是明确的辅助文字角色；text-muted-foreground 只选择颜色。
- Modal 组合 DialogContent 的 application 布局：应用 CSS 管既有640/860/920/1040等任务尺寸，不被原语默认 sm:max-w-lg/grid/p-6 压住。MaterialDialog 继续直接用 Dialog 原语和自己的阅读尺寸。
- 受控 Modal 打开时记录触发对象及任务范围；关闭/成功后返回有效触发对象，失效、禁用、inert、body/焦点guard等目标回到当前可见任务标题，再回 main。外部 onCloseAutoFocus 明确接管时优先。
- ContentVisibility 控制已保留页面和 body Portal 是否实际可见，不清草稿或业务状态；DeferredContent/Details 按需创建长正文。

## 页面与 OpenUI

WorkspaceFrame 统一页头、导航、主区和共享侧栏。展开偏好和拖拽宽度保留；1279px以下物理停靠，1440并排，1024冷打开默认底部Composer，缩窗不会让side覆盖主要动作。业务数据和动作保留在features。

OpenUIWorkspace.css 与正式 SDK 适配器共同定义：Workspace/View主区块24px，Section标题到内容12px，同组Stack16px，导航到内容16px。父容器拥有直接子项间距，内容无页面外 margin。Records/InputForm/Report复用现成表格/字段/产物；模型不写CSS补间距。横向组合由明确Stack声明，不按子组件类型猜测。

原生 checkbox/file、表头排序、业务步骤与结构入口按实际语义保留；动态面板宽度、列宽、连线与节点几何不是待清除的硬编码。

## 验证与维护

pnpm check:styles 检查明确层、语义颜色、退役入口和基础控件外观归属；不禁止所有数字、几何或原生标签。实现修改后运行 typecheck/build、相关业务路线，并在1440×900/1024×768实际操作看图。

style-governance.spec.ts 对间距、尺寸/字体、缩窗命中、保存/关闭/失效触发的焦点以及稳定字段/任务弹窗截图作回归。截图变化必须实际看图后再更新，不以采集脚本通过或自动更新golden代替视觉判断。

历史取舍和本轮证据见 conductor/tracks/feature-frontend-style-governance_20261102；文档中的旧阶段记录不表示当前提交已重验。
