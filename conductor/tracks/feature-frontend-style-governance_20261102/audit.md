# 深入审查：组件层次与样式归属

日期：2026-11-02。审查正式 src/client 与相关测试，不以 Spike、历史截图或旧 track 的完成记录代替当前事实。基线为有既有未提交修改的源码快照，HEAD 仅用于追溯；逐文件 SHA 与执行环境见 [证据](evidence/baseline/README.md)。本轮没有修改产品代码。

## 方法与范围

1. 从 main → App → 工作项/方法入口追踪 imports、CSS 加载、基础/兼容控件与业务适配。
2. 用 PostCSS 解析 CSS 层与声明，用静态 JSX/导入候选扫描建立调用清单，再人工核对重点调用双方。JSX 扫描不是完整 TS 类型分析，数量表示源码候选，不是屏幕 DOM 数或验收指标。
3. 在独立源码副本、真实应用、临时 fixture 数据与随机 loopback 端口下构建和操作；不复制用户业务数据或模型密钥，不访问托管实例。
4. 检查 1440×900、1024×768，冷打开与缩窗、表格/表单、画布/配置、任务弹窗、长内容/折叠、错误保留、焦点与非空列表菜单，并逐张查看代表截图。

## 当前事实

| 盘点对象 | 结果 | 含义 |
| --- | --- | --- |
| 正式 JSX/CSS | 102 个 TSX，20 个 CSS，约 5.9k 行 CSS | 源码范围，不代表全部分支已浏览器覆盖 |
| Button 调用候选 | 兼容 API 123 处/40 文件，primitive API 134 处/34 文件 | 两种默认语义均有大量调用，不能只改新页面 |
| 原生标签候选 | input 46、button 22、select 16、textarea 12 | input 中 checkbox 23、file 4；其余有 47 处文本/数字/URL/password/textarea/select 表单入口需分类核对 |
| CSS 层 | 10 个文件含未分层规则，共 369 条源码规则 | 包含兼容/第三方及未达文件，不等于 369 个缺陷，也不能机械全部包层 |
| 颜色 | 大部分原始颜色在主题变量中，主题之外仅 2 处 CSS 颜色字面值 | 主要缺口是所有权、尺寸/组合，而非到处随意用颜色 |
| 手写动态 style | 侧栏拖拽宽度、结果 col 比例、连线路径透传 | 有运行时含义，应保留 |
| 基础层方向 | primitives 未发现向 features 的 import | 基础依赖方向可继续沿用，问题集中在 CSS 所有权 |
| 静态未达 CSS | WorkResultSet.css 未出现在 main 的静态/字面量动态导入闭包 | 仅为清理候选，删除前另查全仓/构建入口 |

完整候选与 imports/CSS 文件清单见 [component-inventory.json](evidence/baseline/component-inventory.json)。

## 问题及具体反例

### F01：缩窗后侧栏覆盖主要动作（高，已复现）

- 输入：1440 打开含 InputForm 的工作项，再缩到 1024，保持展开侧栏。
- 实际：“保存输入”位置 x=924、y≈704.6、宽 78；其中心命中工作项 Assistant 中的按钮。scrollWidth=1024，普通无溢出断言仍通过。1024 冷打开则使用底部 Composer，说明不是所有窄窗口状态都一样。
- 原因：[WorkItemDetail 的 assistantOpen](../../../src/client/features/work-items/WorkItemDetail.tsx) 只按首次窗口/保存状态初始化；[WorkspaceFrame.css](../../../src/client/components/WorkspaceFrame.css) 在 1200 以下把 side 绝对定位，但主区不让位。
- 失效假设：只有页面不横向溢出就能保证任务可用。
- 处理：公共骨架统一有效布局，分离用户意图与窗口容纳能力。覆盖冷打开、缩放往返、保存宽度和手动展开。SG05。
- 证据：[遮挡截图](evidence/baseline/screenshots/item-1024.png)、[冷打开截图](evidence/baseline/screenshots/item-1024-fresh.png)、browser-baseline.log 的 OCCLUSION。

### F02：局部组合规则被全局层叠压制（中，已复现）

- 输入：页内 InputForm 含文本、enum、boolean/textarea；再放入 OpenUI Dialog。
- 实际：OpenUIWorkspace.css 中 `.declared-input-form .field { margin:0 }` 被未分层 `.field` 覆盖，页内仍为 bottom=19px；`.modal-actions` 声明 4px，页内实际 24px。弹窗中字段还叠加 top=18px、bottom=19px。弹窗动作区已有特定未分层修补，可得到 4px，因此不能把“所有动作区都 24px”当事实。
- 原因：[styles.css](../../../src/client/styles.css) 的 `.field`、`.muted`、`.modal*` 混合外观与外部排版且未分层；[OpenUIWorkspace.css](../../../src/client/features/openui/OpenUIWorkspace.css) 在 components 层，选择器再具体也不能胜过未分层普通声明。
- 影响：同一内容组件换一个容器，间距就依赖上下文；最新父容器 gap 合同无法完全生效。
- 处理：迁移共享规则与所有依赖方，Field 不带页面 margin，动作区局部组合；验证 computed style，而非只看声明。SG01/02/04。
- 证据：browser-baseline.log 的 layout；[弹窗度量](evidence/baseline/deep/deep-1024.json) 与 [实际画面](evidence/baseline/deep/deep-1024-dialog.png)。

### F03：表单控件尺寸、包装层和字段字体合同不统一（中，已复现）

- 同一 Inspector：原生 input 高 39.5px、原生 select 高 35px，NativeSelect 高 31.5px。页内 InputFields 文本宽 822px，enum 宽 80px；深入弹窗样例 enum 104px、boolean 80px。
- [NativeSelect](../../../src/client/components/ui/native-select.tsx) 内层 w-full、外层 w-fit，className 仅落内层；CollectionEditor 等调用方另外穿透 wrapper 补宽。`.field > select` 的 13px 字体也不作用于包装后的 select，实际 12.25px。
- [InputFields](../../../src/client/features/work-items/composition/DeclaredInputForm.tsx) 没有统一字段布局合同；Inspector/SemanticFields/设置/工作区表单仍保留多类原生输入。
- 处理：明确标准/紧凑高度、字段填满/工具栏适配，包装层接口由基础控件提供，保持输入类型与原生键盘语义。原生 checkbox/file 和业务导航另行保留。SG03/04/08。
- 证据：browser-baseline.log 的 inspector/item 度量；[Inspector](evidence/baseline/screenshots/inspector-1024.png)。

### F04：同名 Button 的语义和外观被多层决定（中，依赖事实已核对）

- [ui.tsx](../../../src/client/components/ui.tsx) 默认 secondary→outline、size=sm；[ui/button.tsx](../../../src/client/components/ui/button.tsx) 默认 default 实色和 h-9。危险动作又有 danger→outline+红字、primitive destructive 等不同入口。
- 14px 根字号使 h-8 为 28px、h-9 为 31.5px，管理页 CSS 又将 Input 定为 32px；不能把 Tailwind h-8 直接称作 32px。
- canvas-toolbar/header-actions/composer-footer/candidate-bar 等后代规则再次改控件内部尺寸。存在合理的紧凑需求，但表达散落在上下文而非显式尺寸/变体。
- 处理：单一公开 API，迁移时明确映射原主次/危险语义、尺寸、className、ref/asChild；业务 Badge 与 Modal 有独立职责，不应随兼容 Button 整文件删除。SG01/03。

### F05：重复视觉值缺少角色，局部状态色绕过主题（中/低，事实与风险区分）

- 字号以 12px/11px 为主，圆角含 4/5/6/7/8/9/10 等；单个值未必错误，但无法从统一角色判断新组件该用哪个。
- `.catalog-test-ok` 使用未定义 `--completed`，落到 #34d399，偏离已有 --success；窄桌面浮层阴影另有 #0008。
- 根节点没有 dark class，dark 变体以 `.dark` 祖先匹配，而应用暗色由根 token/color-scheme 提供。不能为“统一主题”直接加 dark class，否则会激活原来未生效的背景等分支；其它子树出现 dark 类也不能说明根主题已启用。
- 处理：有限语义尺度与实际主题策略，保持 14px 根字号；先用样板验证再迁移。几何和单次布局值不机械 token 化。SG07。

### F06：受控任务弹窗的焦点交还由调用方遗漏（中，深入检查新增并已复现）

- 输入：在 OpenUI 第二项点击“补充说明”，输入、模拟一次保存失败，Escape 关闭。
- 两尺寸均：等候恢复后 activeElement 为 BODY，触发按钮仍存在但没有焦点。错误显示和输入保留本身正常。
- [Modal](../../../src/client/components/ui.tsx) 支持 onCloseAutoFocus，但没有 DialogTrigger 的受控调用需要自行补齐；[MethodPreview](../../../src/client/features/work-items/composition/MethodPreview.tsx) 已单独实现，[DialogRenderer](../../../src/client/features/openui/OpenUIWorkspace.tsx) 未承接。
- 处理：共享任务浮层组合承担触发/后备锚点合同，保留 hidden 页面的 Portal 归属语义。SG06；仅治理相关组件交接，不扩展成全站可访问性平台。
- 证据：deep-1440.json、deep-1024.json 的 focusRestored=false、focusAfterClose.tag=BODY。

### F07：已有行为检查不能阻止同类视觉退化（中，静态核对）

- 现有测试会留截图、检查文字/操作/溢出，但未发现正式测试中的 toHaveScreenshot/toMatchSnapshot、主要动作命中或控件 computed-style 合同断言。package scripts 有格式化而无对应样式约束。
- 已有文档知道未分层边界，却要求局部继续写未分层来覆盖；历史 ui README 还保留 --color-input 指向 line-strong、已移除工作区 CSS/选择器的描述，与当前 control-border 等现状混杂。
- 处理：少量 meaningful 合同断言、稳定区域视觉基线、最小静态约束与当前指南收敛；不把本轮采集脚本直接当未来通过测试。SG09/10。

### F08：未达样式与合理特例需要分类（低，清理候选）

- WorkResultSet.css 未进入导入闭包；其规则计入源码盘点但不能称为当前屏幕冲突。
- 侧栏拖拽、列宽比例、连线 style 透传、画布节点/端口几何、材料 reader 专用尺寸、原生文件选择/复选框和业务导航均有具体理由。
- 处理：迁移表逐项记录迁移/保留/删除依据；查明未达代码后再删。该类数量降低不是治理目标。SG08。

## 已排除与未测边界

- 字体继承疑点已排除：新旧控件均实际继承 Geist。不能再次把它列为待修复事实。
- 基础依赖方向、OpenUI 原生布局/动作语义已有可复用底座；无需重建 UI 框架或解释器。
- 本轮确定性函数产生真实临时执行，模拟一次 HTTP 保存失败验证呈现；不是模型验证，也不是已有用户数据验收。
- 没有对所有 CSS 分支、所有运行状态、所有现存业务页面逐一截图；更广回归和实际视觉接受属于后续 plan。
- 审查脚本退出成功表示路线完成和证据采集成功，F01/F02/F03/F06 的已知不符合项保存在 JSON/日志中；尚未修复。
