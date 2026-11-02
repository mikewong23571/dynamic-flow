# 前端样式与组件层次治理

状态：Phase 1–4 已实施，Phase 5 验证完成、待最终 review（in-progress）。

- [范围与 SG01–SG10 验收](spec.md)
- [深入审查、F01–F08 与反例](audit.md)
- [组件层次、系统方案与迁移地图](design.md)
- [阶段计划](plan.md)
- [交接与验证边界](documentation.md)
- [源码/浏览器基线与重跑方式](evidence/baseline/README.md)
- [实施证据与迁移处置](evidence/implementation/README.md)
- [规范适用范围](standards/scope.md)

当前已完成控件/组合接口、层叠与实际样式拥有者迁移、响应式与浮层交接修复，并以回归和稳定截图验证。主要方向为统一样式所有权和层叠、控件尺寸/API、组合间距、骨架响应式和任务浮层交接，并建立小范围有效的防回归检查；沿用既有组件库和业务合同。

[最终独立审查](review.md) · [实施证据与分轮边界](evidence/implementation/README.md) · [持续预览](http://10.134.94.200:4336/items/78abd2d8-cad5-42b5-9567-2d93938dd392)

产品改动位于 `/home/mike/projs/fork/dynamic-flow-style-governance`，原仓托管源码保持。
