# 实施计划

- [ ] records/node-ports/flow 校验支持 file 节点；单测。
- [ ] runs：file 节点短路产出（校验 upload 存在、值=文件名、来源为空集合）；单测。
- [ ] 画布 WorkflowNode 渲染 + 添加步骤 + NodeInspector 文件选择（新增 GET uploads 列表端点）。
- [ ] 作者 definitionSchema 放行 file 节点。
- [ ] profile-flow 迁移文件节点；import seed 按文件名实例化；真实模型重跑 scc 验证。
- [ ] createWork 允许空材料 + 对话框与校验文案；测试更新。
- [ ] typecheck/test/browser 回归；AGENTS 同步。
