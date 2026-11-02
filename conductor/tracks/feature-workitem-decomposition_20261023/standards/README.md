# 适用规范

基础模板来源：`/home/mike/.local/share/zt-bridge/skills/conductor/8be292b335b5-ztb11/templates/standards/coding`。已复制 general-principles、compliance-checklist；general/typescript/html-css 来自本仓 conductor/code_styleguides。

按[项目workflow](../../../workflow.md)适配：原型、单仓、直接模块调用；外部Go/Python、生产审计/权限/覆盖率门槛不适用于本TypeScript原型。不得为了模板引入多仓基础设施。

前端以[设计实例](../../../../src/client/DESIGN-NOTES.md)和[统一控件](../../../../src/client/components/ui/README.md)为准；验证遵循[测试指南](../../../../tests/AGENTS.md)。每步先完成具体用户路径，再做相应模块和浏览器检查；不每步全局回归。
