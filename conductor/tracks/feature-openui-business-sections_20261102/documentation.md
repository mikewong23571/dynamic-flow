# OpenUI 业务分组实施记录

## 当前状态
- 当前里程碑：Task1已实施验证，Task2进行相邻路线与最终证据；Task3由编排者负责。
- 已完成：澄清平台外壳与Assistant业务内容边界；新track与隔离范围冻结。
- 下一步：执行agent完成Task2验证/证据提交后交编排者独立复审与持久预览。

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
