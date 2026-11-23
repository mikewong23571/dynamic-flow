# 规范来源与适用范围

五个基础文件从安装包 templates/track 原样复制后填充；coding/README、general-principles、compliance-checklist 从 templates/standards/coding 复制。general、typescript、html-css 从本仓 conductor/code_styleguides 复制。未涉及 Go/Python，不复制这些语言规范。

优先顺序：用户当前指示、根/模块 AGENTS、conductor/workflow.md 和现有业务合同优先于通用模板。项目已采用 conductor/tracks、单仓宿主开发；本轮规划不改建多仓 systems/repos/WORKFLOW 基础设施，不因模板要求自动新建平台或附加确认。

适用原则：明确层次与接口、复用现成控件、调用双方同步、错误如实呈现、聚焦 meaningful 测试、真实浏览器和两尺寸实际看图、保留用户未提交内容和业务数据。

通用编码规范中的后端/Go/Python/i18n/审计平台、专职角色签字和固定函数行数等要求不作为本前端原型的新增门槛；不安装 gts 或其它模板附带工具，不因缺少无关生产设施阻断。TypeScript/HTML-CSS 按 React/TSX 和当前格式化工具的实际语义应用。

具体治理合同和例外见 ../spec.md、../design.md；当前事实与阶段证据在 ../audit.md 和 ../evidence/。本轮仅建档，标准文件存在不表示实施或完整验收完成。
