# 共享记录目录

[records.pseudo.md](./records.pseudo.md) 只描述 Work、Definition、InputItem、Run、NodeResult、Comparison 的当前字段。

待办：

- [ ] 实现对应普通 TypeScript 类型，前后端引用同一组必要字段。
- [ ] 标清定义版本、材料 ID 与结果来源；保留输入快照而非仅保留可变引用。
- [ ] 根据真实 UI 与请求裁剪字段；不为所有对象添加统一基类、仓储接口、生命周期或 schema 平台。

非功能重点：字段名能被人和 coding agent 理解。验收靠 P07/P14/P16/P19/P21 的实际行为，不以“类型齐全”作为完成。
