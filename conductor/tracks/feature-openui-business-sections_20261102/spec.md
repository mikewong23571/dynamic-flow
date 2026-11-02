# OpenUI 业务分组语义与默认边界

## 目标
用户已授权实现。Assistant 使用已有 Section(title, children) 明确表达业务分组，平台负责统一默认视觉边界及合理嵌套层次。Stack 只管排布。区域的业务名字/数量/内容由各工作项决定。
验收：S1 同一 Section 可以混合表格/表单/文字/本组动作，不拆成不同区域；S2 不同显式 Section 有一致且清楚的默认分界；S3 嵌套 Section 标题层次及可访问名称正确，避免层层厚卡片；S4 Stack 不成为业务区域，既有无 Section 界面不自动推断改写；S5 1440×900 和1024×768实际操作实看，内容不溢出、现有选择/输入/对话框动作可用；S6 describe_capabilities 同源组件说明、Assistant 指导和当前文档表达同一合同。
最小例子：Workspace 里 Section("处理事项",[table,actions]) 和 Section("补充资料",[form,dialogOpener]) 是两个作者分组；table/form 空标题避免重复。第二组可以嵌套 Section 组织子任务；Stack([table,actions]) 只是布局。错误沿现有 schema/save/mutation 路径如实呈现，不新增后台动作。

## 非目标
不把演示的处理清单/补充范围/补充当前记录变成平台固定模块；不按子组件类型、业务标签自动分组；不加 DSL/业务对象/样式配置 API，不重写既有 uiProgram，不改业务执行/数据/模型合同。原仓源码和托管4320/4321及已有4335不操作。

## 改动点
| 仓库 | 路径 | 说明 |
|---|---|---|
| dynamic-flow | src/client/features/openui/ | Section 语义渲染、默认边界、嵌套标题/样式；允许必要小文件 |
| dynamic-flow | src/shared/openui.ts | Section/Stack 描述、同源能力说明和示例 |
| dynamic-flow | src/server/assistant/workitem.ts | 精简通用分组作者规则 |
| dynamic-flow | tests/openui.test.ts、tests/browser/openui-sections.spec.ts | 必要语义/真实浏览器验证，复用现有 fixture |
| dynamic-flow | docs/workitem-ui-authoring.md、相关模块 AGENTS | 当前合同同步 |
| dynamic-flow | 本 track、conductor/tracks.md | 计划证据和审查 |
另可更新 .flowcraft-preview-data 中已有合成演示的 uiProgram，必须带真实 revision/programId，持久数据不提交。
只改清单内文件；需要扩大范围先上报编排者更新 spec。独立worktree基线8be1587，前一治理track已done，旧结论不能替代本轮验证。

## 影响域
共享组件库→describe_capabilities→工作项Assistant；官方OpenUI渲染器→Section层次/Stack布局→已有Records/InputForm/Dialog。回归相关OpenUI模块、capabilities/workitem浏览器和样式治理；保留动作归属/状态保存/Portal语义。真实模型是否遵从指引未实跑不得声称通过。
