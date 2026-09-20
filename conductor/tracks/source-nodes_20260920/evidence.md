# 验收证据

状态：三步已完成并通过回归与真实模型验证。

## 实施与证据

1. **IR/执行**：FlowNode.kind 增加 `file`（records、node-ports 无入边/output、flow 校验 file.name 非空且 inputs 可空、runs 短路产出文件名）。118 项单测全过。
2. **剖析流程迁移**：profile flow = [file 来源节点] → probe → branch → 小/大两路；seed 用 withProfileFile 按文件名实例化、与内建规范全等复用；runs.start 不再传 input 值。真实模型重跑 scc扫描报告.xlsx：source 秒级完成（不调模型），probe/profile 正常，洞见登记 M07，消息 completed（约 22 分钟，网关断流由 retry 续跑）。
3. **创建去材料化**：createWork 允许空材料（空白条目仍拒绝），expectImport 特殊路径删除；创建只需目标。
4. **画布**：添加步骤可选「文件」，NodeInspector 从 uploads 选择（新 GET /api/works/:id/uploads 端点），截图确认选择与未保存草稿提示；内建·数据剖析工作出现在流水线库。

## 回归

- `pnpm typecheck:app` ✓；`pnpm test` 118 全过；`pnpm test:browser` 15 全过。

## 未做（后续）

- 材料节点（kind:'material'）与试验样本节点化；uploads/制品的 UI 查看入口；资源面板整合。
