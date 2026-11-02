# 实施计划

状态：用户已授权主动闭环 Phase 1–5，现于独立 worktree 实施；Phase 0 已完成。四明确见 [spec.md](spec.md)，方案见 [design.md](design.md)。每任务以实际证据勾选；首个实现提交为 6ebd59b；其余阶段已验证，当前等待最终独立 review。交付 diff 从独立快照 99cef65 起计算。

## Phase 0：深入审查与基线（本轮完成）

- [x] 追踪正式入口、基础/兼容控件、共享组合、业务适配及骨架的依赖与样式所有权。
  - 验证：PostCSS 盘点、JSX/导入候选盘点与重点调用双方人工核对；逐文件 SHA、数量口径和限制见 evidence/baseline/。
- [x] 在隔离副本核实冲突、尺寸、宽度、缩窗遮挡、组合/任务弹窗、错误保留、焦点及菜单。
  - 验证：独立构建、1 条样式审查和 2 条两尺寸深入审查路线并实际看图；脚本通过只表示证据采集完成，缺陷仍未修复。
- [x] 形成审查、方案、迁移范围、验收/回归矩阵，登记新 track。
  - 验证：F01–F08 对应 SG01–SG10 和后续任务；模板、规范、绑定和内部链接校验。文档未提交，无实现 SHA。

## Phase 1：基础与组合样板

- [x] 建立与托管实例隔离的实施目录，核对当前源码、审查基线及同时修改情况，建立修改前证据。
  - 验证：不能从干净 HEAD 创建副本而遗漏当前未提交实现；端口/代理/dataRoot/构建路径明确。长期预览使用独立 worktree 和 .flowcraft-preview-data。
- [x] 落实有限 token、层顺序和实际暗色策略；保持基础继承、原生 option 背景与第三方基线。
  - 验证：两尺寸字号、控件高度、状态色/边界/焦点 computed style；根字号维持 14px；不批量开启原来未生效的 dark 分支。
- [x] 收敛 Button API 与标准/紧凑尺寸，统一 Input/Textarea/NativeSelect 的尺寸和字段填满接口；先迁移管理工具栏与 InputFields。
  - 验证：同行对齐；primary/secondary/quiet/danger、disabled、focus、aria-invalid；ref/asChild/事件保持；包装层宽度及键盘选择正确。
- [x] 按真实重复需求收敛 Field/FormActions 与 Modal 组合，修复 F02 局部声明失效。
  - 验证：页内、Section/Stack 内、弹窗内的 InputFields 无叠加页面 margin；帮助/错误/长标签可读；局部和 utilities 覆盖顺序符合合同。

## Phase 2：骨架与浮层交接

- [x] 先以失败回归固定 F01，再统一骨架：用户展开意图与有效布局分开，窗口变化时动作可达。
  - 验证：1440→1024→1440、1024 冷打开、保存/拖拽宽度、手动展开/收起；实际 click/命中与截图，不只检查 scrollWidth；覆盖两种工作区。
- [x] 先以失败回归固定 F06，统一有/无 DialogTrigger 的焦点交还；触发项消失/页面切换有后备锚点。
  - 验证：OpenUI 任务 Escape/关闭/成功、失败重试、MethodPreview 外部触发、材料 Dialog；草稿/Portal 归属和键盘流程保持。
- [x] 检查短桌面长表单、页脚与 Composer 滚动/停靠边界，协调 Modal 和材料阅读专用构图。
  - 验证：1024×768 保存/关闭可达，无滚动遮挡；材料 reader 的专用尺寸不被压回通用窄弹窗。

## Phase 3：按拥有者迁移正式入口

- [x] 迁移 Inspector、SemanticFields、CollectionEditor、ExpressionEditor、连接编辑；保留专用表达式和画布几何。
  - 验证：functional-editor、multi-input、canvas-layout、workitem-composition-call-node；编辑/校验/错误及同行尺寸，原生字段类型与事件保持。
- [x] 迁移模型目录、创建/添加材料/试运行/调用/续做表单，移除对应内部外观覆写。
  - 验证：设置/模型选择器、文件选择、disabled、直接输入、失败/取消/重开；密钥继续不回显，不写入证据。
- [x] 迁移工作项表格/条件/子项/动作/输入及 OpenUI 嵌套组合，保持声明布局语义。
  - 验证：openui-workitem、openui-capabilities、openui-review、workitem-composition-primitives；Section/Stack/ViewNavigation/Disclosure/Dialog、空标题、长正文、选择/草稿/错误和真实命令。
- [x] 迁移结果阅读、来源、比较、Assistant 与菜单；第三方覆盖归实际拥有者。
  - 验证：openui-process、workitem-workspace、会话/方法引用/导航；长 Markdown/集合、固定 Run/来源返回、流式内容与 IME；不搬动业务状态。
- [x] 对全部原生控件、兼容调用和 CSS 文件作迁移/原生保留/未达路径说明，检查旧入口调用归零。
  - 验证：重跑盘点并人工核对；checkbox/file/业务导航保留可解释，不以原生标签数量降低验收。

## Phase 4：清理与防止反复

- [x] 删除无调用的兼容 Button/失效覆盖，收敛 .field/.muted/.modal-actions 的隐式排版，复核 F05/F08。
  - 验证：无未定义 --completed 回退；重复外观引用语义值；WorkResultSet.css 等候选先核对可达性/全仓引用；动态 style 与专用几何有保留说明。
- [x] 加入最小静态检查及控件状态/代表页面视觉基线，限定第三方适配例外。
  - 验证：临时引入已禁止的新颜色/旧 API/无归属覆盖能被发现，再撤销试验；视觉基线识别真正外观变化，排除时间/ID/流式内容；不引入通用 lint 平台。
- [x] 收敛当前指南，替换过时入口及矛盾的层叠/字号说明，历史留在 track。
  - 验证：client AGENTS、ui README、DESIGN-NOTES、product-guidelines、tests AGENTS 与实现/命令一致，不建立第二套长期规范。

## Phase 5：整体复核与交付

- [x] 完成类型、构建与受影响模块/相邻路线回归。
  - 验证：pnpm typecheck:app、pnpm build；按实际变更选择上述 Playwright 路线，状态/端口/导航变化才补相应模块测试。失败归属明确，不借用历史结果。
- [x] 两尺寸逐屏操作并看图，对照 SG01–SG10；复核键盘、命中、失败保留与首屏阅读。
  - 验证：控件矩阵、两种工作区、非空管理列表、来源/长内容/弹窗；分别记录主观判断、真实模型与真实业务读取是否执行。
- [~] 汇总改动、迁移残余、验证、未测边界和交付状态，再判断能否完成。
  - 验证：必需问题均有修复与证据；不因审查/计划完成标 done，按逻辑工作单元本地提交，保留原仓未提交现场，不自动 push 或部署托管实例。

Phase 1 治理实现提交：`6ebd59bdd34a85a83256a51a0ed6265cea7f83b4`。该提交包括保持单一 API 可编译所必需的调用方迁移；Phase 3 的行为验收仍在后续任务中完成。

当前验证断点：Phase 2–4 已完成；Phase 5 类型/构建/静态检查、24 条模块回归、冻结构建55条既有浏览器路线均通过；最终产物再跑14条治理+8条直接受影响导航用例22/22通过，无更新golden。两尺寸截图及新版字段组矩阵已实看。证据口径、迁移处置和未测边界见 evidence/implementation/README.md。最后交付项保留执行中，待父会话独立review及持续预览交接。

第二逻辑治理提交：`c3b52e3`。持续预览在独立4336已完成，合成数据纯函数运行completed；两尺寸真实预览截图与任务交接操作通过。最后交付项仅等待父会话独立review，不等待用户再次授权。
