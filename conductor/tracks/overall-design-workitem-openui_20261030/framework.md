# OpenUI正式集成依据

核查日期2026-10-30。以下为官方能力/当前安装事实，不是本项目集成通过证据；实施必须完成plan Phase 1。

## 已确定的采用边界

| 官方能力 | 本项目用法 | 依据 |
| --- | --- | --- |
| defineComponent/createLibrary、Renderer与库描述 | 同一个正式库封装现有控件，主内容和Assistant预览共用Renderer；从同源描述生成prompt/schema | [组件](https://www.openui.com/docs/openui-lang/defining-components)、[React API](https://www.openui.com/docs/api-reference/react-lang) |
| 原生表单、状态及交互事件 | 选择/输入是界面状态，提交进入实际命令；@ToAssistant回当前既有会话 | [Renderer](https://www.openui.com/docs/openui-lang/renderer)、[交互](https://www.openui.com/docs/openui-lang/interactivity) |
| Query/Mutation与toolProvider | 读取真实固定记录，显式用户动作提交同一业务服务；保存成功后再刷新读取 | [读取和写入](https://www.openui.com/docs/openui-lang/queries-mutations) |
| mergeStatements具名增量编辑 | 保存完整合并结果，修改一个块不重新生成所有视图；流式未完成补丁不直接发布 | [增量编辑](https://www.openui.com/docs/openui-lang/incremental-editing) |
| 同源parser与验证元数据 | 保存检查组件、参数、引用与完整性，错误反馈当前Assistant；不把可容错显示等同正式保存 | [core API](https://www.openui.com/docs/api-reference/lang-core)、[可靠性](https://www.openui.com/docs/openui-lang/reliability) |

官方Renderer支持接入自有组件库；框架处理展示和界面交互，本项目的Pi、业务命令、Definition/Run仍承担实际工作。用户选择OpenUI，故删除旧json-render链并正式接入框架，不退回“只用tokenizer、另写解释器”。

## 必须核实的实际限制

1. 官方说明流式解析会容错处理未完成/不可用组件，部分数组节点会丢弃。正式保存必须检查原始完整输入与解析元数据，不能仅看屏幕不空白。[Renderer](https://www.openui.com/docs/openui-lang/renderer)
2. 动作slot限制并非所有情形都在运行时强制执行。因此组件/工具的实际名称与业务修订/来源都由保存/执行边界核对，不能仅依赖prompt。[动作](https://www.openui.com/docs/openui-lang/actions)
3. 官方具名合并应在补丁完成后进行，以免流式半个root导致未到达节点被删除；必须验证未涉及声明和本地阅读状态。[增量编辑](https://www.openui.com/docs/openui-lang/incremental-editing)
4. Query/Mutation调用的是浏览器toolProvider。适配器只调用本应用真实HTTP入口，业务检查仍在服务端；UI动作序列不接管长时图调度。[读取和写入](https://www.openui.com/docs/openui-lang/queries-mutations)

Query会自动调用同一个toolProvider中的函数，故仅验证工具名不够：本项目保存时检查Query只能引用读工具，写工具只能作为Mutation由明确动作触发。草稿及历史聊天预览只给读能力并禁用写动作，AC02包含误写Query和重挂载零写入反例。这是实际工具分类，不建立权限平台。

当前package.json只有@openuidev/lang-core 1.0.2；现有shared/ui-authoring手写子集求值，DeliveryView等仍用@json-render。正式react-lang版本、严格保存接口、表单失败/状态保持及Pi消息适配须在隔离纵向样例核对；不得把网上API与本地锁定包未经验证地混用。

保留现有assistant-ui，不另起对话运行时。官方也有[@openuidev/assistant-ui适配](https://www.openui.com/docs/api-reference/assistant-ui)，其中人类工具完成/继续需要原运行时接回；当前计划直接在既有消息和工作区使用同一Renderer，不为此引入另一套人类等待协议或Vercel运行时。

不接入托管Gateway、Autofix、云状态或新遥测平台；这些不是当前需求。框架失败通过当前模型的明确反馈→修正→保存解决，不静默修复或换假数据。
