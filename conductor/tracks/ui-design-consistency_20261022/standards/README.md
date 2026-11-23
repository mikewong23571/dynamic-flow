# 适用规范

沿用本仓已采用的前端规范，不引入外部 Go/Python 后端模板中的生产治理、国际化平台或覆盖率门槛。

- 本目录 `general-principles.md`、`typescript.md`、`html-css.md` 是建档时从 `conductor/code_styleguides/` 复制的规范快照；适用方式以 [仓库 workflow](../../../workflow.md) 为准。
- 项目语义与原型范围以根 AGENTS、[前端指南](../../../../src/client/AGENTS.md) 和 [产品指南](../../../product-guidelines.md) 为准。
- 视觉与控件规则以 [设计实例](../../../../src/client/DESIGN-NOTES.md)、[控件约定](../../../../src/client/components/ui/README.md) 为准；实施时更新原文，不在 track 维护第二套设计规范。
- 浏览器与数据边界以 [测试指南](../../../../tests/AGENTS.md) 为准；布局改动通过真实操作、截图与样式检查验证，不为每个视觉细节增加单元测试。

实施自检：整页主次和内容比例是否成立；同类元素是否一致；不同任务是否保留合适布局；所用组件是否服务于设计；来源/返回/输入是否保留；按需渲染与性能是否退化。
