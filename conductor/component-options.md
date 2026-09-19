# 组件职责与当前取舍

2026-09-20 按 [简化设计](../docs/design.md) 重写。先前目录/源码优先的候选分析已由本文件替代；技术实测保留在 [历史 Spike](./tracks/component-integration-spike_20260919/results.md)。

## 选择原则

组件帮助用户理解、修改、验证工作流；选择依据是具体操作与所需衔接代码，不按已经安装了什么安排产品界面。用户对旧 Spike 的视觉、配色与组件组合明确不满意，不能复用其外观作为产品模板。

## 当前组件

| 组件职责 | 复用方案 | 应用承担的业务工作 |
| --- | --- | --- |
| WorkflowCanvas | React Flow | IR 节点/连接映射、添加删除、连接变更、选中上下文、运行状态 |
| NodeInspector | shadcn/ui 的表单、Tabs、Disclosure 等 | 按节点种类编辑任务/参数；查看输入、结果和错误 |
| WorkbenchShell | CSS + react-resizable-panels 按需 | 画布为主要编辑区，详情、Assistant、结果对比按任务出现 |
| SampleBrowser | 简单列表；多列表格用 TanStack Table v9 | 稳定样本 ID、多选快照、区分选择与打开详情 |
| ResultComparison | 复用列表/表格/Markdown | 同输入比较，草稿变化标记过期；定义采用与产物保留独立 |
| WorkflowAssistant | assistant-ui + Pi | 将选中 nodeId、定义版本、样本与结果交给 Agent；写回同一 IR 草稿 |
| DefinitionViewer | 可选只读代码文本 | 展示 IR 的 JS 表示，不提供任意代码编辑或反向转换 |

[React Flow](https://reactflow.dev/) 负责画布交互，不是执行引擎。布局坐标不决定数据依赖；业务连接需要经过 IR 校验后再用于运行。

[assistant-ui](https://www.assistant-ui.com/docs/runtimes/custom/external-store) 负责对话呈现与输入，不拥有另一份工作流定义。作者会话修改结构或配置后，应能看到具体节点/参数/连线变化，不能只显示 Agent 的“已修改”解释。

[shadcn/ui](https://ui.shadcn.com/docs) 提供基础控件源码；专业的布局、信息层级与交互取舍仍由产品设计负责，不把多个默认主题拼在一起。

## 本轮移除的选型问题

- 不再在 Monaco、CodeMirror、Pierre Diffs 之间选择核心源码编辑器；原型不需要该入口。
- 不再比较 Babel/TypeScript Compiler API 来反推流程图；IR 直接表达结构。
- 不再以 Arborist 目录树替代主画布；需要查看多个执行实例时使用列表即可。
- 不先加入 ELK 等复杂布局、自由停靠、节点市场、虚拟化和专门评测平台。

## 需要验证的真实摩擦

1. 拖拽、连线与节点配置是否只更新同一份定义，保存后能否重现。
2. 连线是否明确表达输入/输出，缺失配置或错误连接能否定位到对象。
3. runtime 的事件能否直接关联定义节点与输入项，逐项实例是否易于展开检查。
4. Assistant 修改 IR 后，画布变化是否清楚，当前版本是否保持稳定。
5. 样本输入与定义版本是否冻结，比较过期与两个采用动作是否易懂。
6. 画布、配置、结果和聊天是否延续同一视觉和操作体系。

只围绕这一条闭环继续试验；不要先搭一个全功能 n8n 或新的编译平台。
