# OpenUI 业务分组实施记录

## 当前状态
- 当前里程碑：Task1/Task2均完成实施和验证；Task3由编排者独立收口。
- 已完成：澄清平台外壳与Assistant业务内容边界；新track与隔离范围冻结。
- 下一步：编排者完成Task3最终审查、预览交接和绑定释放。

## 决策记录
|日期|决策|原因|
|---|---|---|
|2026-11-02|保留Section/Stack API，作者显式分组、平台统一呈现|业务分组不能按组件类型猜测；不为三块演示过拟合|
|2026-11-02|复用已完成治理worktree，冻结8be1587增量基线|不触碰原仓脏现场和托管watch进程；前track保持已结束|

## 仓库执行与交付
单仓本地提交，scope文件记录worktree和commits；项目workflow优先于通用多仓远程发布要求。预览和数据保留，不自动push/MR。

## 变更日志
- 2026-11-02：按模板新建并绑定codex真实会话；规范来自coding模板和本仓指南。代码由执行agent完成。

## Task 1 实施

保留原Section/Stack schema，SectionRenderer用实际React深度context和useId：显式组有可访问命名，嵌套标题按有标题祖先推进（h2到h6封顶），空标题无悬空aria-labelledby；重复标题仍有唯一ID。Dialog以自身h2任务标题为独立层级，内部Section为h3。轻横线区分主组，轻侧线/缩进表达子组；不套卡片，不按内容猜组。shared/openui.ts同源描述、例子和Assistant通用作者规则、当前authoring及模块AGENTS同步。旧track文件只读，conductor索引旧治理new条目纠为done并链接其已完成证据。

新增真实browser fixture反例在修改前因找不到“处理事项”命名region失败；改后1440/1024两条基本用例已通过，实际证明h2/h3/h4、组内真实表格/输入/动作、选择保持、Dialog Escape/焦点/草稿与真实submit_input。旧无Section程序仍直接渲染；空标题及重复名称兼容。6条OpenUI模块、typecheck:app、check:styles、build通过；当前截图已实际查看，Task2继续补窄屏子组滚动图及相邻回归。真实模型未执行，不声称模型会自动遵循指引。

## Task 2 验证完成

Task1实现提交`0f56951fe2a7d5bdf3c5dfe5a7c653dce0463148`。产品构建随后保持冻结，25条浏览器全部通过（Section2、capabilities2、workitem6、既有治理15）；12条模块为OpenUI6与工作项后端6，包括describe_capabilities真实工具接线fixture。随后把旧程序夹具强化到source完全不含Section，2条两尺寸定向重验通过，仍是同一25条不同用例。未修改相邻测试或既有golden，未用update-snapshots。

6张实际图覆盖1440/1024主区、下滚后嵌套子组、任务弹窗；已实际view_image查看主/子组边界、两尺寸排布和任务标题层次，窄屏可滚动到后续内容，无横向溢出。选择、输入草稿、任务Escape/焦点、真实submit_input、旧无Section布局、空标题、重复标题的唯一ID均有断言。类型、构建、静态样式守卫与变更Prettier检查通过；构建只保留已有bundle大小警告。实际分轮日志及截图见evidence/README.md。没有真实模型调用，不声称模型生成质量或自动遵从分组指引已验收。

父会话维护的preview-*为4336独立持久合成样例证据，可随Task2归档；独立审查review.md和Task3状态由父会话写入最后提交。本执行agent不修改持久预览或旧done track，不push/MR或部署托管实例。

Task2验证与证据提交：`3e8379241bd8ff7792dafa781f8132f0dcde857c`；Task1实现为`0f56951fe2a7d5bdf3c5dfe5a7c653dce0463148`。执行agent已完成Task1/2，后续Task3由编排者接续，保持预览/数据，不提前done或释放。

## Task3与收口
编排者review与独立预览证据提交b616ab3；检查了真实调用双方、diff和两尺寸主区/子组/任务截图。4336预览通过正式保存合同更新合成程序revision5→6，固定delivery身份保留；选择、草稿、Escape焦点和窄屏动作命中通过。原仓src聚合hash前后不变。详细证据/边界见review.md。

按项目单仓workflow完成本地交付；不适用通用模板多仓push/MR/check-complete/archive要求，不自动发布托管实例。0f56951为实现，3e83792为测试证据，b7f635f为SHA回写，b616ab3为独立审查。本次清空会话导航字段并删除heartbeat；仅同步本track与原仓registry新条目，不改原仓产品。

## 2026-11-02 全量合并
用户新授权后，完整开发分支合入master，当前未提交现场保存在e367c44和backup/pre-full-governance-merge_20261102。仅索引文档冲突已解决；产品树与已验收开发分支一致。主工作区类型/样式/OpenUI6项重验通过，依赖按锁离线安装通过。详细过程与边界见integration.md；历史未发布/未写原仓描述为此前状态，不代表本次合并后状态。无远端push或主动托管重启。

## 托管更新
用户授权更新服务后，构建通过并重启flowcraft.service，4320/4321及前端API代理读回200，实际提供新的Section模块与样式。既有工作项文件保留、模型配置哈希不变。产品版本e7b340c；完整证据与启动窗口边界见deployment.md。
