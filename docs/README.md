# 设计文档

[唯一工作项处理流程与 OpenUI 集成](workitem-openui-flow.md)（2026-10-30目标设计，实施待开始）：一份当前处理/输入权威、正式OpenUI框架、可检查的中间过程，以及允许彻底删除退役代码和业务数据的清理计划；实施见[新track](../conductor/tracks/overall-design-workitem-openui_20261030/index.md)。取代旧双轨和“只借OpenUI parser、json-render渲染”的目标取舍，不代表当前代码已改造。

[任务访问与导航合同](task-navigation-contract.md)：固定应用导航、对象关系与状态恢复；独立预览已按合同改造，验收及限制见导航track。

本轮设计提案：[工作项驱动的元应用设计](workitem-meta-application-design.md)。从用户交付价值划分工作项、组合流程、可复用流水线和执行职责，覆盖工作项 Assistant、方法目录、输入规范化、动态成果界面与 CVE 审计推演；供后续实现与验收使用。

[工作项原语与动态界面的实现调研](workitem-meta-implementation-research.md)：官方规范与固定源码对比、工作流恢复及 UI 校验实验、浏览器反例，以及原语目录、渲染接入、统一命令和 Assistant 工具的实现建议。

当前需求梳理入口：[围绕真实工作持续求解](work-journey-stories.md)。贯通开始、形成方法、执行、试验、成果续做与结项，标明现状和待设计项；原故事和历史验收保留。

1. [用户故事与原型验收](./user-stories.md)：按六类用户目标组织的讨论稿，含故事验收条件和八条验收路线。
2. [当前产品与技术设计](./design.md)：持续工作项与分治，画布编辑 + JS 语义子集 IR + 持久等待。
3. [原始设计归档](./archive/README.md)：v2 原文与字节校验，保留历史，不作为当前开发要求。
4. [项目上下文](../conductor/index.md)：产品摘要、交互指南、技术状态和 tracks。
5. [组件接入实验](../conductor/tracks/component-integration-spike_20260919/results.md)：历史技术证据；画布/源码相关推荐已被当前设计调整，实验视觉已被否定。

用户当前明确要求优先，其次以当前设计和同步后的 Conductor 文档为准。归档和已完成实验不能反向覆盖新的产品决定。

[用户故事伪代码 Spike](../spike/README.md)：项目目录骨架、模块功能与非功能要求、接口、测试设计及闭环推演；不是可运行实现。

[模块与验收地图](./implementation-map.md)：正式 src 骨架、各模块 AGENTS、用例责任、跨模块验收与设计假设修订方式。

[术语与编号](./glossary.md)：文档缩写、用户故事/测试场景编号与基本工程说明。

[持续工作项故事](workitem-stories.md)：独立业务身份、等待与恢复、方法演进及依据结项，按 H1–H11 和 L1–L5 验收。

[问题驱动的动态工作流方案](semantic-workflow.md)：本轮优化的认知提升、概念取舍与第一性原理审查；实施状态与验收见对应 track。

[WebSearch MCP 调用指南](websearch-mcp.md)：服务地址、本地凭据变量、MCP 会话流程、三个工具的参数和已测边界；应用已通过 Pi MCP 插件接入，真实调查结果另见流水线证据。

[Sourcegraph MCP](sourcegraph-mcp.md)：Assistant 与执行节点的内部代码检索、环境认证头及真实应用调用证据。

[CVE 流水线 v1](../pipelines/cve/README.md)：已保存并采用的漏洞材料收集、业务影响分析两条方法，包含定义、布局、人工交接方式和本次验证；节点通过 Pi MCP 插件调用 WebSearch。

[工作项中的成果检查与业务推进](workitem-workspace.md)：轮次/环节导航、结构化内容操作、来源追溯、成果比较与使用，以及跨页返回的产品行为。

[对齐工作主线的应用改动路径](work-journey-change-plan.md)：五阶段实施建议、保留能力、输入与成果交接边界及分批验收；当前仅完成规划。

[CVE 节点函数与 prompt 草图](cve-node-function-sketch.md)：待评审设计，以显式材料和固定仓库版本为输入；尚未实施。

[漏洞研究与源码分析新伪代码](cve-source-analysis-pseudocode.md)：新的功能边界草案，显式输入与取证能力，尚未实施。

[CVEAWG MCP](cveawg-mcp.md)：本机stdio服务、公开CVE查询工具与Pi应用调用验证。

[工作项分治与交接](../conductor/tracks/feature-workitem-decomposition_20261023/acceptance.md)：手工/候选/节点拆分、结构化材料修订、范围待办、批量处理与整体确认；现行合同见design.md。

- [工作项界面安排共编规范](workitem-ui-authoring.md)：具名列表/详情/动作、可读描述、同源编辑与固定成果重绑。
