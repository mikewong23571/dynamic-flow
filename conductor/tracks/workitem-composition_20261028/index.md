# 工作台入口与工作项内从需求到交付

**T访问合同已交付，整体导航优化已转交独立track。** 当前导航实现和验收见[feature-task-navigation_20261029](../feature-task-navigation_20261029/index.md)；本track保留此前S原型及T合同文档过程，R业务结果回接仍另列。

2026-10-29此前S：导航语义由LLM通过navigation=tabs/select明确声明，不按数量切换；真实high模型已保存Tabs。输入任务移到输入页，移除成果通用核对条；详情使用模型标题/字段/业务动作，通用工具统一收纳，保持当前记录和表格勾选独立。实际两尺寸看图、16项模块及15条浏览器分轮通过，见[当前实施与责任](navigation-and-details.md)。R回接缺口仍未声称解决。

2026-10-29此前Q/R：工作项流程保留原生英文原语/端口；通过配置文件设置DeepSeek V4 Flash/high，真实Assistant在空白工作项及无UI模板目录自主生成5视图并修正记录合同。原四Tab演示为人工模板复用，不能当自主设计验收。撤销把动作适用条件拼成业务待办；跨方法动作回接原界面仍有明确平台缺口，未声称完整闭环。[当前设计、实跑及限制](fresh-assistant-design.md)。仅独立4330。

2026-10-29此前P：展示闭环与工作项多会话已实施。成果页可按当前声明推进、更新并人工验收，缺失/失配界面交给当前会话；同一Assistant内新建/切换/历史及独立草稿，业务状态共享。44项模块及8项浏览器通过，真实模型证明新会话隔离与旧会话续接；[合同、具体修正及分层证据](closure-and-conversations.md)。仅独立4330。

2026-10-29此前O：单层流水线应用节点与IR原语展示已实施。逐项/整批应用、匹配/分路、收集及交付绑定依真实定义呈现，3次调用保留1个图节点；[设计与当前证据](call-application-design.md)。合成演示已在独立4330可查看，托管不变。

2026-10-29此前N阶段：工作项调用节点内显示真实流水线名称、固定版本及查看入口，复用现有画布/弹窗查看引用定义；旧版及缺失行为、两尺寸画面见[节点内流水线引用](call-node-reference.md)。只在独立预览。

2026-10-29此前M阶段：按用户反馈用页内可收展来源卡片替代菜单，复用材料卡片外观；应用固定来源身份与追溯，Assistant声明业务字段/标签。见[来源卡片及职责](source-cards.md)。两尺寸实际看图与定向验证完成，仍只在独立预览。

2026-10-29此前L阶段：按用户反馈收敛交付来源，单一入口、具名步骤与实际内容菜单选择；已完成两尺寸实际查看和固定产物定位，见[来源展示](source-presentation.md)。仅独立预览继续完善，托管不变。

2026-10-29此前K阶段：具名界面安排已支持结构/描述往返及与同一Assistant局部共编；同源保存、固定Run重绑和真实模型验证见[共编实施与审阅](ui-authoring-review.md)。

2026-10-29此前J阶段：工作项业务流程收敛为薄调用；Assistant保存可操作的业务界面，真实模型及页面推进已验证，见[当前实施与审阅](interaction-review.md)。

2026-10-29补齐：左侧首页/工作项/流水线、两种全宽列表及原生浏览器历史；[当前导航设计与证据](navigation.md)。此前的顶部入口Tab尝试已删除。

## 当前执行入口

- [目标、范围与职责](spec.md)
- [推进流程与阶段回退](workflow.md)
- [当前计划与完成依据](plan.md)
- [业务界面与薄胶水](interaction-plan.md)
- [最终职责与视觉审阅](interaction-review.md)
- [设计审阅与业务验收](acceptance.md)
- [保留的模块交接合同](contracts.md)
- [决定及被取代的取舍](decisions.md)
- [分层证据与当前限制](evidence.md)

此前B—S已有分层证据；当前T仅完成规范文档，页面与NAV验收待办见plan，不能沿用此前测试宣布新导航通过。

## 背景与历史

产品依据：[元应用设计](../../../docs/workitem-meta-application-design.md)、[实施调研](../../../docs/workitem-meta-implementation-research.md)。

[历史计划](plan-before-design-reset.md)、ui-framework-v2.md、frontend-v2.md、ui-journey-review.md及其截图保留用于追溯，不作为当前设计基线或推进授权。既有提交价值审查见[commit-audit](commit-audit.md)。

产品工作区：`/home/mike/projs/fork/dynamic-flow-workitem-composition`。本目录为当前track文档；工作区副本保持同步。托管4320/4321与独立预览4330/4331分开，不改托管服务。

- [人与Agent共编界面安排：现成项目与当前原语对照](visual-composition-research.md)（研究记录，实施取舍以K阶段规范与审阅为准）

- [当前实施规范：界面安排共编](ui-authoring-spec.md)（K阶段已实施并验证）

2026-10-29：整版原型已停机切换至托管4320；[部署与真实模型验收](../feature-task-navigation_20261029/deployment.md)记录首轮规划失败及收敛后最小链路通过，既有R业务回接缺口仍保留。
