# 方案校验验收

## 结论

草案校验、真实输入/调用单位、界面/动作引用、明确Run的真实字段与版本检查通过；canExecute/canPublish/unchecked分开，发布后另读回publication.current。校验不写业务数据、不启动执行、不确认条件。

## 真实模型

独立4330/4331，DeepSeek V4 Flash high。验收项840f8d8f-7422-4fbd-8364-448a334cf15f，提供真实测试输入q1=20/q2=35及来源材料；预置identity/aggregate却声明对象输出的通用反例。模型先通过check_workspace取得NODE_OUTPUT_SCHEMA_MISMATCH，修正为逐条透传、保存界面、再检查，通过后才execute，唯一一轮正式运行completed，无失败Run，输入及条件未改。

首轮随后发现旧publish工具在publish_ui_plan之后再次独立发布，覆盖uiPlanId绑定。已补发布读回状态与Agent入口约束、消除提示词中两个发布指引的冲突。第二轮模型只用check_workspace→publish_ui_plan→check_workspace，识别missingOutputs=[quotes]并修复为publication.current=true；保持同一Run、定义、输入和未确认条件。原始trace保留，不将第二轮修复描述为首轮一次完整通过。

## 界面与边界

浏览器1440/1024实际操作并查看截图，报价列表两行与原文相同，计划视图实际绑定。仅发现预览已有favicon.ico 404，无JS执行错误。无新增前端控件或页面骨架。

子项来源通过真实临时文件/HTTP验证发现→预览→明确选择、排除无关项、不自动结项；未用真实模型推进原1084条业务。校验只检查已知根调用包与identity透传；不模拟下游图，不宣称证明模型事实、全部分支、真实仓库影响或审计完成。独立预览测试数据不会复制到托管。最终测试与部署结论后补。

## 最终检查与部署

- 最终完整模块：284/284通过，test-concurrency=2，约105秒；测试进程隔离外部MCP配置，真实模型另见trace.json，不混称。定向24项在当时版本通过，后增固定旧Run测试由完整模块覆盖。
- 类型检查、构建、所改TS格式及git diff --check通过。
- 17个源码/测试/指南增量对账无冲突，主目录其它未提交内容保留。
- 经用户此前停机切换授权，2026-10-29T17:57:44.703803+00:00停止，2026-10-29T17:58:05.552625+00:00恢复，约21秒；前端4320/API4321均200，systemd active/NRestarts=0。依赖与模型连接未更改。
- 备份：`/home/mike/.local/state/flowcraft/backups/plan-check-20261029T175537Z`，含本次增量之前的源文件/配置、明确变更清单与停机数据。回退须先保留新数据、停服务、按清单移除本次新增文件并恢复代码/数据配套备份，不只回代码。
- 部署后全部1184个原数据文件哈希一致，无缺失或改写；原批次仍paused。已存在交付的验收项checkWorkspace返回canExecute/canPublish/publication.current=true；真实旧父项102b1480-da04-4465-821e-515d993d4dca返回WORKSPACE_NOT_READY，不误报已就绪。没有初始化其新流程、恢复批次或启动真实漏洞研究。
- 独立预览已重载最终源码并重新读回publication.current=true；只有原一条成功Run。

当前边界：Agent可检查并修正机械合同、读取/选择直属子项固定阶段来源，但这不自动把旧父项变成审计交付。完整领域方案与证据仍需Assistant及用户协作推进；不宣称真实CVE批次、所有下游分支或业务操作回接已验收。
