# 前端治理交接与证据

## 当前状态

- 当前里程碑：用户已授权主动闭环 Phase 1–5，独立 worktree 实施/验证中；原仓源码及用户未提交现场保持。
- 初建阶段仅审查建档；随后用户授权实施 Phase 1–5。当前按逻辑单元本地提交，不自动 push 或部署托管实例。
- 已完成：102 TSX/20 CSS 盘点、重点调用双方核对、隔离构建、1 条初查路线、2 条两尺寸深入审查路线、代表截图实看、四明确 spec、方案与分阶段计划。
- 当前断点：Phase 1–4 实施与验证完成；Phase 5 验证完成，正在整理持续预览并等待父会话独立 review。
- 已修复：缩窗动作遮挡、字段/控件尺寸与 wrapper 宽度、失效局部层叠、受控任务焦点回 BODY 与隐藏页面材料 Portal 泄漏；最终断言及限制见下方实施证据。

## 初建审查记录（历史状态）

以下建档决定与验证是实施授权之前的记录；后续当前状态以实施段和证据 README 为准。

## 决策记录

| 日期 | 决策 | 原因 |
| --- | --- | --- |
| 2026-11-02 | 复用 Geist/shadcn/Radix、React Flow、assistant-ui、OpenUI | 依赖方向已有基础，问题可由样式所有权和公开组合接口解决 |
| 2026-11-02 | 沿用 conductor/tracks 与单仓 workflow.md | 现有项目约定优先，不为建档迁移 Conductor 基础设施 |
| 2026-11-02 | 从安装包真实路径复制 track 模板和 coding 规范 | skills 是符号链接，按真实位置读取绑定约定与模板；语言规范沿用本仓 TS/HTML-CSS |
| 2026-11-02 | 不创建实施 worktree、不触碰业务源码 | 当前授权为审查建档；后续须包含工作区实际未提交源码，不能拿 HEAD 冒充当前实现 |
| 2026-11-02 | 统计仅作迁移候选；保留原生/几何/动态样式 | 避免用控件或 CSS 数量代替实际一致性与业务路线验收 |
| 2026-11-02 | 焦点交接列入相关浮层组合治理 | 两尺寸具体反例成立，范围仅限共享组件交接，不扩展为全站平台 |

## 仓库执行记录

| 日期 | 仓库 | 动作 / 基线 | 说明 |
| --- | --- | --- | --- |
| 2026-11-02 | dynamic-flow | 在 /tmp/flowcraft-ui-audit-hr5h73ih 使用独立源码副本和 node_modules 链接 | 临时自动审查夹具符合 /tmp 使用边界；随机端口/临时 dataRoot，未复制用户数据或 models.toml |
| 2026-11-02 | dynamic-flow | 基线 HEAD 6fa6e9d47c9e3286d96884aa28f02e368ef2e2bd | 工作区有大量既有未提交内容；此 SHA 不是完整源码基线，逐文件 SHA 在 component-inventory.json |
| 2026-11-02 | dynamic-flow | 本轮只写新 track、tracks.md、index.md | 旧 track 仅只读；真实 codex session 见 binding.yaml，pid 为已校验的本机 app-server |

## 验证与实际结论

| 验证 | 实际结果 | 限制 |
| --- | --- | --- |
| 独立 Vite 构建 | 通过，build.log | 有 bundle 大小提示，非本 track 范围；不表示视觉通过 |
| 样式初查 | 1 条路线通过，保留 12 张截图与布局/控件/命中度量 | 已知缺陷作为测量结果，没有伪装成预期通过断言 |
| 深入组合/任务路线 | 1440/1024 两条通过，保留 10 张截图与两个 JSON | 合成材料、真实临时应用/函数执行；一次明确 503 fixture 验证错误与输入保留 |
| 焦点反例 | 两尺寸等待后仍 focusRestored=false、activeElement=BODY | 当前未修复，未来应转成有意义的失败回归再修复 |
| 源码盘点 | PostCSS 解析与静态 JSX/import 候选分析完成 | JSX 扫描有启发式限制，关键调用人工核对；未达 CSS 仅作候选 |
| 文档与范围 | 本轮检查内部链接、YAML、任务标记、源文件 SHA 与 diff 范围 | 具体最终校验结果追加在下方，不借用历史数量 |

没有执行全量模块/浏览器回归、真实模型、托管业务数据验收或用户视觉确认。本轮详细证据与重跑方式见 [evidence/baseline/README.md](evidence/baseline/README.md)。

建档校验：32 个本 track 本地 Markdown 链接、157 个正式源码文件 SHA、JSON 与 YAML 解析、owner/真实 session/Agent/live pid 均通过；Phase 0 三项完成，其余 18 项保持待办。新文件文本检查和所改索引 diff 空白检查通过。归档后的扫描脚本已重跑，两个归档浏览器脚本复制至独立副本后 `playwright --list` 正确发现 3 条路线；实际运行结果采用上表已完成的审查日志，不把发现列表当作又运行一次。

## 仓库提交与交付

本轮文档未提交，无产品实现提交、push、MR 或部署。编码与交付将在后续实施中按本仓 workflow 记录，当前不建立多仓 repo-scope。track 不能因规划完成标 done。

## 变更日志

- 2026-11-02：完成深入审查、四明确 spec、组件层次方案、迁移/回归计划与证据归档；新增 track 登记。

## 2026-11-02 实施启动

用户明确授权主动闭环 Phase 1–5。独立 worktree 为 `/home/mike/projs/fork/dynamic-flow-style-governance`，分支 `feature/frontend-style-governance_20261102`；冻结现有未提交工作区的本地基线提交为 `99cef65b63155322a3f6f3ac684daaadcc760a25`。该提交仅保存此前已存在的源码/资料，不是本 track 的治理改动，后续交付 diff 从它开始。未复制用户 data、models.toml 或运行目录，node_modules 只读复用。产品改动只发生在独立 worktree，不回写托管 watch 工作区。阶段证据与提交在独立 worktree 持续更新，主会话将同步本 track 文档。

## 基础与组合样板

单一 Button API 及调用方映射、标准32/紧凑28控制高度、Select包装fill/fit、Field/FormActions、所有自有CSS分层和vendor导入已接通。原生可编辑输入已迁移，checkbox/file及业务导航保留。共有3条新回归改前失败，改后和已实看截图的稳定区域golden重跑均通过；类型与构建通过。Modal使用公开application布局，避免DialogContent默认utilities压住640/860/920/1040等组合宽度；材料reader保持自己的Dialog原语布局。公共WorkspaceFrame按视口切停靠，保留用户展开偏好；受控任务焦点已回到触发动作。Phase2完整状态与Phase3相邻路线仍待后续验证，未据局部成功提前勾完。

证据见 evidence/implementation/foundation-*.txt；截图在 tests/browser/style-governance.spec.ts-snapshots/。已实际查看字段两尺寸与任务弹窗640宽度，接下来补成功/失效触发和方法侧栏交接，并执行全模块相邻路线。

## 受控任务交接与夹具诊断

普通受控任务Escape原来回BODY的产品反例已修复，成功提交/关闭回原动作和失效动作回任务标题均有回归。扩展失效动作测试曾使用普通getByRole计数0作为移除屏障；Radix在弹窗打开期间aria-hide背景，此断言提前通过，Escape发生在客户端接纳新程序之前。该失败属于A类夹具观察错误，已改includeHidden等待实际DOM移除；不能把中间“DOM复用”推测写为产品根因。最终日志明确旧trigger disconnected、新Dialog完成关闭后activeElement=H1。临时console已移除。

材料reader是直接Dialog组合，单独发现其打开时切Tab/后退仍泄漏Portal的具体反例；新增失败回归后由DialogPortal与MaterialDialog控制可见性，保留材料阅读状态，返回原页后可继续阅读/关闭。共享useTaskDialogFocus由Modal和材料reader共同使用，避免再次分别遗漏任务交接。广回归先冻结构建再运行；一次因调试重构建而中断的旧轮次不计最终验收。

隔离环境清理：snapshot基线曾误跟踪node_modules环境symlink；当前仅从Git索引移除这条记录，实际依赖仍由独立node_modules链接覆盖目录只读复用。为最小CSS检查明确登记PostCSS开发依赖，lock仅增加对应importer三行，没有更改原仓依赖或用户数据。

## Phase 2–5 当前检查点

单一控件API及全部正式入口迁移、26个自有CSS文件分层/拥有者、共享字段组UA reset、最小静态守卫与稳定截图基线已落实。Phase 1本地提交6ebd59bdd34a85a83256a51a0ed6265cea7f83b4；后续治理为第二逻辑单元，交付diff相对99cef65快照。当前14条治理与8条受影响导航回归22/22通过，无update-snapshots；冻结构建的55条既有浏览器路线及24条模块测试通过。55条与最终重跑分轮保留，不把重复测试累加。没有执行真实模型/用户数据验收，未push或部署托管实例。

材料Portal反例已用明确flow→inputs的真实SPA历史重新验证：去除可见性约束后，在底层flow已选中的前提下旧Dialog仍存在，恢复约束后通过。旧的裸URL回退前提不确定，未作为产品缺陷证据；当前evidence/implementation/material-visibility-red.txt仅保留有效红测。Fieldset默认padding造成的组内缩进已由FormFields自身reset并补bounding断言，更新golden后实看。详细验收映射、迁移残余和分轮产物见evidence/implementation/README.md。
