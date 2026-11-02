# 模块测试与整体验收

本目录测试正式`src/`应用。继承根约定；历史`examples/component-spike`不为正式产品背书。先读目标用例的fixture、数据和模型边界；不要把已有断言数量当作当前提交的验收结论。

## 按改动选测试

| 改动 | tests/入口 |
| --- | --- |
| 组件样式层次、字段尺寸/间距、缩窗命中和任务焦点 | browser/style-governance.spec.ts；pnpm check:styles |
| 文件/定义保存、冲突、材料维护 | state.test.ts、workspace-performance.test.ts |
| 普通运行、显式operation、失败诊断重试 | runs.test.ts、functional-ir.test.ts、multi-input.test.ts |
| 嵌套call、逐端口映射/广播及精确来源 | composition-runtime.test.ts、method-references.test.ts |
| 等待、停止、中断恢复和进程重启 | lifecycle-runtime.test.ts、lifecycle-process.test.ts |
| 冻结材料、schema生命周期和业务正文合同 | runtime-mechanisms.test.ts |
| 同输入比较、采用与保留独立 | trials.test.ts、client.test.ts |
| 作者工具、节点上下文、材料剖析 | assistant.test.ts、functional-author.test.ts、multi-input-author.test.ts、profile-import.test.ts |
| Pi MCP接线 | mcp.test.ts，真实SDK和本地MCP/模型HTTP fixture |
| HTTP/SSE及接线 | integration.test.ts、invoke.test.ts、create-items-integration.test.ts |
| 唯一私有Work、唯一绑定、正式补跑和成果发布 | workitem-unification.test.ts、workitem-composition-backend.test.ts |
| 工作项身份、条件/重开和进展报告 | work-items.test.ts、workitem-progress.test.ts、criterion-citation.test.ts |
| 父子范围、received修订、候选回执与1000项分页 | workitem-decomposition.test.ts、child-stage-inputs.test.ts、descendant-stage-inputs.test.ts |
| 批次在途观察、暂停、恢复 | item-batches.test.ts |
| 官方OpenUI解析、Query/Mutation、原生组合及程序合同 | openui.test.ts |
| 原生逐项动作/任务表单、失败保留及真实写入，双尺寸组合 | browser/openui-capabilities.spec.ts |
| CVE领域普通计算方法，精确目标/记录来源 | cve-v2.test.ts、batch-result.test.ts；领域schema在pipelines内 |
| 方法编辑、画布布局/聚焦 | canvas-layout.test.ts、canvas-focus.test.ts、canvas-view-state.test.ts |
| 原生OpenUI表格/表单、选择/草稿、界面块修改 | browser/openui-workitem.spec.ts |
| call进入真实内部Run/实例，输入/输出与来源 | browser/openui-process.spec.ts、browser/workitem-composition-call-node.spec.ts |
| 父子独立输入、等待事件、人工结项/重开、31条成果来源与冻结 | browser/openui-lifecycle.spec.ts |
| 普通无WorkItem共享Run阅读、重试/保留/续做/改进和空态 | browser/workitem-workspace.spec.ts |
| 列表层级、分页、轮询焦点和键盘 | browser/management-presentation.spec.ts |
| 工作项导航、方法引用、Assistant会话 | browser/workitem-composition-navigation.spec.ts、roots.spec.ts、method-references.spec.ts、conversations.spec.ts（均有workitem-composition-前缀） |
| 普通方法工作台、结构化编辑和打开状态 | browser/workspace.spec.ts、same-work-reopen.spec.ts、opened-pipelines.spec.ts、functional-editor.spec.ts、multi-input.spec.ts |

旧GenerateItemMethod、workflowId业务指针、Work作者业务副本和旧ItemUiPlan界面已退役。旧GUI测试族的逐项取消/保留能力映射见[本track测试承接矩阵](../conductor/tracks/overall-design-workitem-openui_20261030/evidence/test-retirement.md)。不要在测试工具中翻译旧业务API来维持兼容。

## 运行边界

```sh
pnpm exec tsx --test tests/runtime-mechanisms.test.ts
pnpm test
pnpm typecheck:app
pnpm build
pnpm exec playwright test tests/browser/openui-lifecycle.spec.ts --output /tmp/flowcraft-browser-results
```

所有浏览器用例从`browser/fixtures.ts`导入test，默认提供临时dataRoot、真实应用和随机私有端口；用例自建应用也必须同样隔离。根Playwright配置不启动或复用托管4320/4321。并行代理各用独立`--output`，避免trace/network临时文件互相删除。构建后浏览器使用正式dist，不把旧构建当作当前源码验证。

页面身份由`/items/:id`、`/methods/:id`及其tab/run/view参数控制；不要往旧`dynamic-flow.work`写值来模拟导航。Sidebar“工作项/流水线”是link。HTTP设置fixture必须返回当前DTO；列表按服务端页码和pageSize分页。

`createApplication({dataRoot, executeNode})`和本地HTTP模型fixture用于真实调用双方与确定性机制验证。fixture不代表真实模型质量；真实模型另按track记录输入、工具和实际执行结果。无模型测试节点明确使用普通函数，不写固定业务答案伪装模型成功。

## 证据与交付

- 类型检查、模块测试、跨模块真实HTTP/runtime、模型fixture、真实模型和浏览器分别报告；相互不能替代。
- UI覆盖1440×900、1024×768，实际看截图中的等待/失败/输入/长内容与来源按钮可达性。`FLOWCRAFT_EVIDENCE_DIR`可指定本轮路径，避免覆盖历史track图片。
- 失败保留具体输入、实际/预期、最小修复及验证。有效业务断言迁到当前路线；被明确取消的旧GUI布局/接口可以退役，但要记录承接矩阵，不靠删失败用例宣称能力通过。
- 测试文件行为用真实临时目录；不要修改或清空已有用户数据。`pnpm typecheck`还检查旧实验，错误归属需分开。
- 修复后只扩大到受影响相邻模块；通过后无新增疑点无需反复重跑。

样式回归：style-governance.spec.ts-snapshots只固定稳定字段区域与任务弹窗，时间/对象ID不纳入golden。更新前先看实际图和差异，确认有意变更后才使用--update-snapshots；命中检查只针对已启用动作。Radix弹窗打开期间aria-hide背景，验证触发对象真正移除须includeHidden并等客户端接纳新快照，不能把普通getByRole的不可见计数当DOM移除。
