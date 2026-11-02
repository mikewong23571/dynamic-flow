# 前端治理交接与证据

## 当前状态

- 当前里程碑：Phase 0 深入审查与规划完成，track.status=new，Phase 1–5 待实施。
- 用户已认可系统治理方向，并要求先深入审查再建 track；本轮没有执行产品改造、提交/push 或部署。
- 已完成：102 TSX/20 CSS 盘点、重点调用双方核对、隔离构建、1 条初查路线、2 条两尺寸深入审查路线、代表截图实看、四明确 spec、方案与分阶段计划。
- 下一步：进入本 track 的 Phase 1，重读当前源码差异后建立独立实施目录，从公共控件/字段样板开始。
- 已复现问题：缩窗遮挡、局部间距失效、新旧尺寸及 wrapper 宽度差异、受控任务弹窗焦点回到 BODY。治理未开始，均不能标为已修复。

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
